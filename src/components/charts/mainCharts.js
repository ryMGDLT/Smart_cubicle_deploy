import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Bar, Line } from "react-chartjs-2";
import { EllipsisIcon, ChevronDown, ChevronUp } from "lucide-react";
import { Chart } from "chart.js";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../ui/dropdown-menu";
import { axiosInstance } from "../controller/authController";
import { debounce, isEqual } from "lodash";
import annotationPlugin from "chartjs-plugin-annotation";
import { DateTime } from "luxon";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { Button } from "../ui/button";

Chart.register(annotationPlugin);

// Usage Monitoring Chart Component
export const UsageMonitoringChart = () => {
  const [usageChartType, setUsageChartType] = useState("line");
  const [chartData, setChartData] = useState(null);
  const [lastSuccessfulData, setLastSuccessfulData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [predictionHours, setPredictionHours] = useState([]);
  const [showPeaks, setShowPeaks] = useState(true);
  const [drawTime, setDrawTime] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const chartRef = useRef(null);
  const gradientRef = useRef(null);
  const isFetchingRef = useRef(false);

  const debouncedSetChartType = useCallback(
    debounce((type) => setUsageChartType(type), 100),
    []
  );

  const createGradient = useCallback(
    (chart) => {
      if (!chart?.canvas || usageChartType !== "line") {
        return "rgba(54, 162, 235, 0.2)";
      }
      if (gradientRef.current) {
        return gradientRef.current;
      }
      const ctx = chart.canvas.getContext("2d");
      const chartArea = chart.chartArea || { top: 0, bottom: 400 };
      const gradient = ctx.createLinearGradient(
        0,
        chartArea.bottom,
        0,
        chartArea.top
      );
      gradient.addColorStop(0, "rgba(54, 162, 235, 0.1)");
      gradient.addColorStop(1, "rgba(54, 162, 235, 0.6)");
      gradientRef.current = gradient;
      return gradient;
    },
    [usageChartType]
  );

  const createStyles = useMemo(() => {
    return (length, predictionHours, showPeaks, gradient) => {
      const isPeak = (index) => showPeaks && predictionHours.includes(6 + index);
      const backgroundColors = Array(length)
        .fill()
        .map((_, i) =>
          isPeak(i)
            ? "rgba(255, 99, 132, 0.6)"
            : usageChartType === "line"
            ? gradient
            : "rgba(54, 162, 235, 0.6)"
        );
      const borderColors = Array(length)
        .fill()
        .map((_, i) =>
          isPeak(i) ? "rgba(255, 99, 132, 1)" : "rgba(54, 162, 235, 1)"
        );
      const pointRadii = Array(length)
        .fill()
        .map((_, i) => (isPeak(i) ? 6 : 4));
      return {
        backgroundColors,
        borderColors,
        pointBackgroundColors: borderColors,
        pointBorderColors: borderColors,
        pointRadii,
        pointHoverRadii: pointRadii.map((r) => r + 2),
      };
    };
  }, [usageChartType]);

  const handleDayChange = (increment) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + increment);
    setSelectedDate(newDate);
  };

  const setupChart = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const formattedDate = DateTime.fromJSDate(selectedDate)
        .setZone("Asia/Manila")
        .toISODate();

      console.log(`Fetching data for ${formattedDate}`);

      const [occupancyResponse, predictionResponse] = await Promise.all([
        axiosInstance.get(`/api/occupancy/${formattedDate}`),
        axiosInstance.get(`/api/occupancy/predictions/${formattedDate}`),
      ]);

      const occupancyData = occupancyResponse.data;
      const { hours } = predictionResponse.data;

      console.log("Occupancy data received:", occupancyData);

      if (occupancyData.length === 0) {
        setError(`No data available for ${formattedDate}, 6 AM to 7:59 PM.`);
        setChartData(null);
        return;
      }

      if (!isEqual(hours || [], predictionHours)) {
        setPredictionHours(hours || []);
      }

      const allHours = Array.from({ length: 14 }, (_, i) => {
        const hour = 6 + i;
        return DateTime.fromObject(
          {
            year: DateTime.fromJSDate(selectedDate).year,
            month: DateTime.fromJSDate(selectedDate).month,
            day: DateTime.fromJSDate(selectedDate).day,
            hour,
          },
          { zone: "Asia/Manila" }
        ).toJSDate();
      });

      console.log(
        "Generated hours:",
        allHours.map((h) => DateTime.fromJSDate(h).toISO())
      );

      const mergedData = allHours.map((hour) => {
        const item = occupancyData.find(
          (d) => new Date(d.timestamp).getTime() === hour.getTime()
        );
        return {
          timestamp: hour,
          value: item ? item.value : 0,
        };
      });

      console.log("Merged data:", mergedData);

      const labels = mergedData.map((item) => {
        const date = DateTime.fromJSDate(item.timestamp).setZone("Asia/Manila");
        const hours = date.hour;
        const ampm = hours >= 12 ? "PM" : "AM";
        const displayHours = hours % 12 || 12;
        return `${displayHours}:00 ${ampm}`;
      });
      const values = mergedData.map((item) => item.value);

      const gradient = chartRef.current
        ? createGradient(chartRef.current)
        : "rgba(54, 162, 235, 0.2)";
      const styles = createStyles(labels.length, hours || [], showPeaks, gradient);

      const newChartData = {
        labels,
        datasets: [
          {
            label: "Usage",
            data: values,
            fill: usageChartType === "line",
            backgroundColor: styles.backgroundColors,
            borderColor: styles.borderColors,
            tension: 0.4,
            pointBackgroundColor: styles.pointBackgroundColors,
            pointBorderColor: styles.pointBorderColors,
            pointRadius: styles.pointRadii,
            pointHoverRadius: styles.pointHoverRadii,
          },
        ],
      };

      if (!isEqual(newChartData, chartData)) {
        setChartData(newChartData);
        setLastSuccessfulData(newChartData);
      }
      setError(null);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err.response?.data?.message || "Failed to fetch data");
      if (lastSuccessfulData) {
        setChartData(lastSuccessfulData);
      } else {
        setChartData(null);
      }
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [
    usageChartType,
    showPeaks,
    createStyles,
    chartData,
    predictionHours,
    lastSuccessfulData,
    selectedDate,
  ]);

  useEffect(() => {
    setupChart();
    const intervalId = setInterval(() => {
      setupChart();
    }, 30000);
    return () => clearInterval(intervalId);
  }, [setupChart]);

  useEffect(() => {
    gradientRef.current = null;
  }, [usageChartType]);

  const drawTimePlugin = {
    id: "drawTimePlugin",
    beforeDraw(chart) {
      if (chart.config.type === "line") {
        chart.drawStartTime = performance.now();
      }
    },
    afterDraw(chart) {
      if (chart.config.type === "line" && chart.drawStartTime) {
        const drawEndTime = performance.now();
        const timeTaken = drawEndTime - chart.drawStartTime;
        setDrawTime(timeTaken.toFixed(2));
      }
    },
  };

  useEffect(() => {
    Chart.register(drawTimePlugin);
    return () => {
      Chart.unregister(drawTimePlugin);
    };
  }, []);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 500,
        easing: "easeOutQuart",
        x: { duration: 500, easing: "easeOutQuart" },
        y: { duration: 500, easing: "easeOutQuart" },
        colors: { duration: 500, easing: "easeOutQuart" },
        numbers: { duration: 0 },
        grid: { duration: 0 },
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            generateLabels: (chart) => {
              const defaultLabels = chart.data.datasets.map((dataset, i) => ({
                text: dataset.label,
                fillStyle: Array.isArray(dataset.backgroundColor)
                  ? dataset.backgroundColor[0]
                  : dataset.backgroundColor,
                strokeStyle: Array.isArray(dataset.borderColor)
                  ? dataset.borderColor[0]
                  : dataset.borderColor,
                hidden: chart.getDatasetMeta(i).hidden,
                datasetIndex: i,
              }));
              return [
                ...defaultLabels,
                {
                  text: "Peak",
                  fillStyle: "rgba(255, 99, 132, 0.6)",
                  strokeStyle: "rgba(255, 99, 132, 1)",
                  hidden: !showPeaks,
                  isPredictedPeak: true,
                },
              ];
            },
          },
          onClick: (e, legendItem, legend) => {
            const ci = legend.chart;
            if (legendItem.isPredictedPeak) {
              setShowPeaks(!showPeaks);
            } else {
              const index = legendItem.datasetIndex;
              const meta = ci.getDatasetMeta(index);
              meta.hidden =
                meta.hidden === null ? !ci.data.datasets[index].hidden : null;
              ci.update();
            }
          },
        },
        tooltip: {
          callbacks: {
            label: (tooltipItem) => {
              const hour = 6 + tooltipItem.dataIndex;
              const isPredicted = showPeaks && predictionHours.includes(hour);
              const label =
                hour === 19
                  ? `${isPredicted ? "Peak Usage" : "Usage"}: ${
                      tooltipItem.raw
                    } Visits`
                  : `${isPredicted ? "Peak Usage" : "Usage"}: ${
                      tooltipItem.raw
                    } Visits`;
              return label;
            },
          },
        },
        annotation: {
          annotations: {
            morningAfternoonSeparator: {
              type: "line",
              xMin: 6,
              xMax: 6,
              borderColor: "rgba(0, 0, 0, 0.5)",
              borderWidth: 2,
              borderDash: [5, 5],
              label: {
                content: "Morning | Afternoon",
                enabled: true,
                position: "top",
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                color: "white",
                font: { size: 12 },
                padding: 4,
              },
            },
            afternoonEveningSeparator: {
              type: "line",
              xMin: 10,
              xMax: 10,
              borderColor: "rgba(0, 0, 0, 0.5)",
              borderWidth: 2,
              borderDash: [5, 5],
              label: {
                content: "Afternoon | Evening",
                enabled: true,
                position: "top",
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                color: "white",
                font: { size: 12 },
                padding: 4,
              },
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: false, text: "Number of Visits" },
          animation: false,
        },
        x: {
          grid: { display: true },
          offset: true,
          animation: false,
          ticks: {
            callback: function (value, index) {
              const labels = [
                "6:00 AM",
                "7:00 AM",
                "8:00 AM",
                "9:00 AM",
                "10:00 AM",
                "11:00 AM",
                "12:00 PM",
                "1:00 PM",
                "2:00 PM",
                "3:00 PM",
                "4:00 PM",
                "5:00 PM",
                "6:00 PM",
                "7:00 PM",
              ];
              return labels[index];
            },
          },
        },
      },
    }),
    [showPeaks, predictionHours]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-lg font-semibold">Usage Monitor</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleDayChange(-1)}
            disabled={loading}
            aria-label="Previous day"
          >
            <ChevronDown className="h-5 w-5 text-gray-500" />
          </Button>
          <DatePicker
            selected={selectedDate}
            onChange={(date) => setSelectedDate(date)}
            dateFormat="MM/dd/yyyy"
            showPopperArrow={false}
            popperPlacement="bottom"
            popperModifiers={[
              {
                name: "offset",
                options: { offset: [0, 8] },
              },
              {
                name: "preventOverflow",
                options: {
                  rootBoundary: "viewport",
                  tether: false,
                  altAxis: true,
                },
              },
              {
                name: "flip",
                options: { fallbackPlacements: ["bottom"] },
              },
              {
                name: "computeStyles",
                options: { adaptive: true, gpuAcceleration: false },
              },
            ]}
            customInput={
              <span className="text-gray-700 font-medium cursor-pointer rounded-md px-2 py-1 hover:bg-gray-100">
                {selectedDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "2-digit",
                  year: "numeric",
                })}
              </span>
            }
            wrapperClassName="react-datepicker-center"
            disabled={loading}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleDayChange(1)}
            disabled={loading}
            aria-label="Next day"
          >
            <ChevronUp className="h-5 w-5 text-gray-500" />
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 border border-gray-200">
              <EllipsisIcon className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => debouncedSetChartType("bar")}>
              Bar Chart
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => debouncedSetChartType("line")}>
              Line Chart
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="relative w-full h-full">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p>{error}</p>
          </div>
        ) : !chartData ? (
          <div className="flex items-center justify-center h-full">
            <p>
              No data available for{" "}
              {selectedDate.toLocaleDateString("en-US", {
                month: "short",
                day: "2-digit",
                year: "numeric",
              })}
              , 6 AM to 7:59 PM.
            </p>
          </div>
        ) : usageChartType === "bar" ? (
          <Bar ref={chartRef} data={chartData} options={chartOptions} />
        ) : (
          <Line ref={chartRef} data={chartData} options={chartOptions} />
        )}
      </div>
    </div>
  );
};

// Resources Usage Chart Component
export const ResourcesUsageChart = () => {
  const [resourceChartType, setResourceChartType] = useState("bar");
  const [chartData, setChartData] = useState(null);
  const [lastSuccessfulData, setLastSuccessfulData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const chartRef = useRef(null);
  const isFetchingRef = useRef(false);

  const debouncedSetChartType = useCallback(
    debounce((type) => setResourceChartType(type), 100),
    []
  );

  const handleDayChange = (increment) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + increment);
    setSelectedDate(newDate);
  };

  const fetchResourcesData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const formattedDate = DateTime.fromJSDate(selectedDate)
        .setZone("Asia/Manila")
        .toISODate();

      console.log(`Fetching resources data for ${formattedDate}`);

      const [usageResponse, recommendedResponse] = await Promise.all([
        axiosInstance.get(`/api/dispenser/usage?date=${formattedDate}`),
        axiosInstance.get(`/api/dispenser/recommended?date=${formattedDate}`),
      ]);

      const usageData = usageResponse.data;
      const recommendedData = recommendedResponse.data;

      console.log("Usage data received:", usageData);
      console.log("Recommended data received:", recommendedData);

      if (
        !usageData ||
        usageData.length === 0 ||
        !recommendedData ||
        recommendedData.length === 0
      ) {
        setError(`No data available for ${formattedDate}.`);
        setChartData(null);
        return;
      }

      const labels = [
        "Cholorox",
        "Multipurpose cleaner",
        "Toilet bowl cleaner",
        "Glass and Mirror cleaner liquid",
      ];

      const actualValues = labels.map((_, i) => {
        return usageData.reduce(
          (sum, entry) =>
            sum + (parseFloat(entry.dispenser_volumes[`CONT${i + 1}`]) || 0),
          0
        );
      });

      const recommendedValues = labels.map((_, i) => {
        return recommendedData.reduce(
          (sum, entry) =>
            sum + (parseFloat(entry.recommended_usage_ml[`CONT${i + 1}`]) || 0),
          0
        );
      });

      console.log("Actual Values:", actualValues);
      console.log("Recommended Values:", recommendedValues);

      if (recommendedValues.every((val) => val === 0)) {
        console.warn("Recommended usage is all zeros; verify data.");
        setError(
          "Recommended usage data is missing or zero. Please check the data source."
        );
        setChartData(null);
        return;
      }

      if (actualValues.every((val) => val === 0)) {
        console.warn("Actual usage is all zeros; verify data.");
        setError(
          "Actual usage data is missing or zero. Please check the data source."
        );
        setChartData(null);
        return;
      }

      const newChartData = {
        labels,
        datasets: [
          {
            label: "Actual Usage (mL)",
            data: actualValues,
            borderColor: "rgba(54, 162, 235, 1)",
            backgroundColor: "rgba(54, 162, 235, 0.6)",
            borderWidth: 2,
            fill: false,
            tension: 0.4,
          },
          {
            label: "Recommended Usage (mL)",
            data: recommendedValues,
            borderColor: "rgba(255, 99, 132, 1)",
            backgroundColor: "rgba(255, 99, 132, 0.6)",
            borderWidth: 2,
            fill: false,
            tension: 0.4,
          },
        ],
      };

      console.log("New Chart Data:", newChartData);

      if (!isEqual(newChartData, chartData)) {
        setChartData(newChartData);
        setLastSuccessfulData(newChartData);
      }
      setError(null);
    } catch (err) {
      console.error("Error fetching resources data:", err);
      setError(err.response?.data?.message || "Failed to fetch resources data");
      if (lastSuccessfulData) {
        setChartData(lastSuccessfulData);
      } else {
        setChartData(null);
      }
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [resourceChartType, chartData, lastSuccessfulData, selectedDate]);

  useEffect(() => {
    fetchResourcesData();
    const intervalId = setInterval(() => {
      fetchResourcesData();
    }, 30000);
    return () => clearInterval(intervalId);
  }, [fetchResourcesData]);

  const chartOptions = useMemo(() => {
    const maxValue = chartData
      ? Math.max(...chartData.datasets[0].data, ...chartData.datasets[1].data)
      : 200;
    const stepSize = Math.ceil(maxValue / 4 / 50) * 50 || 50;

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 500,
        easing: "easeOutQuart",
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            padding: 20,
            font: { size: 12 },
          },
        },
        tooltip: {
          callbacks: {
            label: (tooltipItem) => {
              const datasetLabel = tooltipItem.dataset.label || "";
              const value = tooltipItem.raw;
              return `${datasetLabel}: ${value} mL`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: false,
          title: {
            display: false,
            text: "Volume (mL)",
          },
          ticks: {
            stepSize,
          },
        },
        x: {
          title: {
            display: false,
            text: "Cleaning Solutions",
          },
          offset: true,
        },
      },
    };
  }, [chartData]);

  return (
    <div className="flex flex-col space-y-4 h-full">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-lg font-semibold">Resources Usage</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleDayChange(-1)}
            disabled={loading}
            aria-label="Previous day"
          >
            <ChevronDown className="h-5 w-5 text-gray-500" />
          </Button>
          <DatePicker
            selected={selectedDate}
            onChange={(date) => setSelectedDate(date)}
            dateFormat="MM/dd/yyyy"
            showPopperArrow={false}
            popperPlacement="bottom"
            popperModifiers={[
              {
                name: "offset",
                options: { offset: [0, 8] },
              },
              {
                name: "preventOverflow",
                options: {
                  rootBoundary: "viewport",
                  tether: false,
                  altAxis: true,
                },
              },
              {
                name: "flip",
                options: { fallbackPlacements: ["bottom"] },
              },
              {
                name: "computeStyles",
                options: { adaptive: true, gpuAcceleration: false },
              },
            ]}
            customInput={
              <span className="text-gray-700 font-medium cursor-pointer rounded-md px-2 py-1 hover:bg-gray-100">
                {selectedDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "2-digit",
                  year: "numeric",
                })}
              </span>
            }
            wrapperClassName="react-datepicker-center"
            disabled={loading}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleDayChange(1)}
            disabled={loading}
            aria-label="Next day"
          >
            <ChevronUp className="h-5 w-5 text-gray-500" />
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 border border-gray-200">
              <EllipsisIcon className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => debouncedSetChartType("bar")}>
              Bar Chart
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => debouncedSetChartType("line")}>
              Line Chart
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="w-full h-full flex-grow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p>{error}</p>
          </div>
        ) : !chartData ? (
          <div className="flex items-center justify-center h-full">
            <p>
              No data available for{" "}
              {selectedDate.toLocaleDateString("en-US", {
                month: "short",
                day: "2-digit",
                year: "numeric",
              })}
              .
            </p>
          </div>
        ) : resourceChartType === "bar" ? (
          <Bar ref={chartRef} data={chartData} options={chartOptions} />
        ) : (
          <Line ref={chartRef} data={chartData} options={chartOptions} />
        )}
      </div>
    </div>
  );
};

// Trends Over Time Chart Component
export const TrendsOverTimeChart = () => {
  const [trendsChartType, setTrendsChartType] = useState("line");
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const chartRef = useRef(null);
  const gradientRef = useRef(null);
  const isFetchingRef = useRef(false);

  const debouncedSetChartType = useCallback(
    debounce((type) => setTrendsChartType(type), 100),
    []
  );

  const createGradient = useCallback(
    (chart) => {
      if (!chart?.canvas || trendsChartType !== "line") {
        console.log("Gradient creation skipped:", {
          hasCanvas: !!chart?.canvas,
          chartType: trendsChartType,
        });
        return "rgba(54, 162, 235, 0.2)";
      }
      if (gradientRef.current) {
        console.log("Returning cached gradient");
        return gradientRef.current;
      }
      const ctx = chart.canvas.getContext("2d");
      const chartArea = chart.chartArea || { top: 0, bottom: 400 };
      const gradient = ctx.createLinearGradient(
        0,
        chartArea.bottom,
        0,
        chartArea.top
      );
      gradient.addColorStop(0, "rgba(54, 162, 235, 0.1)");
      gradient.addColorStop(1, "rgba(54, 162, 235, 0.6)");
      gradientRef.current = gradient;
      console.log("Gradient created:", gradient);
      return gradient;
    },
    [trendsChartType]
  );

  const gradientPlugin = useMemo(
    () => ({
      id: "gradientPlugin",
      afterDatasetsUpdate(chart) {
        if (trendsChartType === "line" && chart.data.datasets.length > 0) {
          const dataset = chart.data.datasets[0];
          const gradient = createGradient(chart);
          dataset.backgroundColor = Array(dataset.data.length).fill(gradient);
          dataset.fill = true;
          console.log("Gradient applied in plugin:", dataset.backgroundColor);
        } else {
          console.log("Gradient plugin skipped:", {
            chartType: trendsChartType,
            hasDatasets: chart.data.datasets.length > 0,
          });
        }
      },
    }),
    [createGradient, trendsChartType]
  );

  useEffect(() => {
    console.log("Registering gradientPlugin");
    Chart.register(gradientPlugin);
    return () => {
      console.log("Unregistering gradientPlugin");
      Chart.unregister(gradientPlugin);
    };
  }, [gradientPlugin]);

  const applyGradientFallback = useCallback(() => {
    if (chartRef.current && chartData && trendsChartType === "line") {
      const gradient = createGradient(chartRef.current);
      setChartData((prev) => {
        if (!prev || prev.datasets[0].backgroundColor[0] === gradient) {
          console.log("Gradient unchanged in fallback, skipping update");
          return prev;
        }
        console.log("Applying gradient in fallback");
        return {
          ...prev,
          datasets: prev.datasets.map((dataset) => ({
            ...dataset,
            backgroundColor: Array(dataset.data.length).fill(gradient),
            fill: true,
          })),
        };
      });
    }
  }, [chartData, createGradient, trendsChartType]);

  useEffect(() => {
    applyGradientFallback();
  }, [applyGradientFallback]);

  const parseDurationToMinutes = (duration) => {
    if (!duration || !/^\d{2}:\d{2}$/.test(duration)) {
      console.warn(`Invalid duration format: ${duration}`);
      return 0;
    }
    const [hours, minutes] = duration.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const formatTime = (time) => {
    if (!time || !/^\d{2}:\d{2}$/.test(time)) {
      console.warn(`Invalid cleaningHour format: ${time}`);
      return time || "Invalid";
    }
    const [hours, minutes] = time.split(":").map(Number);
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  };

  const normalizeDate = (dateStr) => {
    if (!dateStr) {
      console.warn("Date string is undefined or null");
      return null;
    }
    let normalizedDate = dateStr.trim();
    if (normalizedDate.includes("/")) {
      const parts = normalizedDate.split("/");
      if (parts.length === 3) {
        let [month, day, year] = parts.map((part) => parseInt(part, 10));
        if (month <= 12 && day <= 31 && year >= 2000) {
          month = month.toString();
          day = day.toString();
          year = year.toString();
          normalizedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        } else {
          [day, month, year] = parts.map((part) => parseInt(part, 10));
          if (month <= 12 && day <= 31 && year >= 2000) {
            month = month.toString();
            day = day.toString();
            year = year.toString();
            normalizedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
          } else {
            console.warn(`Invalid date parts: ${parts}`);
            return null;
          }
        }
      } else {
        console.warn(`Invalid date format (not enough parts): ${normalizedDate}`);
        return null;
      }
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      console.warn(`Unrecognized date format: ${normalizedDate}`);
      return null;
    }
    return normalizedDate;
  };

  const handleDayChange = (increment) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + increment);
    setSelectedDate(newDate);
  };

  const fetchTrendsData = useCallback(async () => {
    if (isFetchingRef.current) {
      console.log("Fetch skipped: already fetching");
      return;
    }
    isFetchingRef.current = true;
    setLoading(true);
    try {
      const formattedDate = DateTime.fromJSDate(selectedDate)
        .setZone("Asia/Manila")
        .toFormat("yyyy-MM-dd");

      console.log(`Fetching janitor data for ${formattedDate}`);

      const response = await axiosInstance.get("/janitors");
      const janitors = response.data;

      console.log("Raw janitors data:", JSON.stringify(janitors, null, 2));

      if (!janitors || janitors.length === 0) {
        setError(`No janitor data available for ${formattedDate}.`);
        setChartData(null);
        return;
      }

      const schedules = [];
      const logs = [];

      janitors.forEach((janitor) => {
        console.log(`Processing janitor: ${janitor.basicDetails?.name || "Unknown"}`);
        console.log("Raw schedules:", JSON.stringify(janitor.schedule || [], null, 2));
        console.log("Raw logs:", JSON.stringify(janitor.logsReport || [], null, 2));

        const normalizedSchedules = (janitor.schedule || []).map((s) => {
          const normalizedDate = normalizeDate(s.date);
          console.log(`Original date: ${s.date}, Normalized date: ${normalizedDate}`);
          return {
            ...s,
            date: normalizedDate,
            janitorName: janitor.basicDetails?.name || "Unknown",
          };
        });

        console.log("Normalized schedules:", JSON.stringify(normalizedSchedules, null, 2));

        const currentSchedules = normalizedSchedules.filter((s) => {
          const isValid =
            s.date === formattedDate &&
            s.task?.toLowerCase() === "clean restroom" &&
            s.status !== "No Work Done";
          if (!isValid) {
            console.log("Filtered out schedule:", {
              schedule: s,
              reasons: {
                dateMatch: s.date === formattedDate,
                dateValue: s.date,
                currentDate: formattedDate,
                taskMatch: s.task?.toLowerCase() === "clean restroom",
                statusValid: s.status !== "No Work Done",
                cleaningHourPresent: !!s.cleaningHour,
              },
            });
          }
          return isValid;
        });

        console.log("Filtered schedules for current date:", JSON.stringify(currentSchedules, null, 2));
        schedules.push(...currentSchedules);

        const normalizedLogs = (janitor.logsReport || []).map((l) => {
          const normalizedDate = normalizeDate(l.date);
          return { ...l, date: normalizedDate };
        });

        console.log("Normalized logs:", JSON.stringify(normalizedLogs, null, 2));

        const currentLogs = normalizedLogs.filter(
          (l) =>
            l.date === formattedDate &&
            l.task?.toLowerCase() === "clean restroom" &&
            l.status === "Done"
        );

        console.log("Filtered logs for current date:", JSON.stringify(currentLogs, null, 2));
        logs.push(...currentLogs);
      });

      console.log("All schedules after filtering:", JSON.stringify(schedules, null, 2));
      console.log("All logs after filtering:", JSON.stringify(logs, null, 2));

      if (schedules.length === 0) {
        setError(`No cleaning schedules available for ${formattedDate}.`);
        setChartData(null);
        return;
      }

      schedules.sort((a, b) => {
        const timeA = (a.cleaningHour || a.timeIn || "00:00").split(":").map(Number);
        const timeB = (b.cleaningHour || b.timeIn || "00:00").split(":").map(Number);
        return timeA[0] * 60 + timeA[1] - (timeB[0] * 60 + timeB[1]);
      });

      const uniqueHours = [
        ...new Set(schedules.map((s) => formatTime(s.cleaningHour || s.timeIn))),
      ].sort((a, b) => {
        const timeA = DateTime.fromFormat(a, "h:mm a").toSeconds();
        const timeB = DateTime.fromFormat(b, "h:mm a").toSeconds();
        return timeA - timeB;
      });

      console.log("Unique hours for labels:", uniqueHours);

      const data = uniqueHours.map((hour) => {
        const schedule = schedules.find(
          (s) => formatTime(s.cleaningHour || s.timeIn) === hour
        );
        if (!schedule) return 0;

        const log = logs.find(
          (l) =>
            l._id === schedule._id &&
            l.date === formattedDate &&
            l.task?.toLowerCase() === "clean restroom"
        );

        const duration = log ? parseDurationToMinutes(log.duration) : 0;
        console.log(`Hour: ${hour}, Schedule ID: ${schedule._id}, Duration: ${duration}`);
        return duration;
      });

      const dataset = {
        label: "Cleaning Schedule",
        data,
        backgroundColor: trendsChartType === "line" ? "rgba(54, 162, 235, 0.2)" : "rgba(54, 162, 235, 0.6)",
        borderColor: "rgba(54, 162, 235, 1)",
        borderWidth: 2,
        fill: trendsChartType === "line",
        tension: 0.4,
        pointRadius: 6,
        pointHoverRadius: 8,
        pointBackgroundColor: "rgba(54, 162, 235, 1)",
        pointBorderColor: "rgba(54, 162, 235, 1)",
      };

      console.log("Dataset:", JSON.stringify(dataset, null, 2));

      const newChartData = {
        labels: uniqueHours,
        datasets: [dataset],
      };

      if (!isEqual(newChartData, chartData)) {
        console.log("Updating chartData:", JSON.stringify(newChartData, null, 2));
        setChartData(newChartData);
      }
      setError(null);
    } catch (err) {
      console.error("Error fetching trends data:", err);
      setError(err.response?.data?.message || "Failed to fetch trends data");
      setChartData(null);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [trendsChartType, selectedDate, chartData]);

  useEffect(() => {
    fetchTrendsData();
    const intervalId = setInterval(fetchTrendsData, 30000);
    return () => clearInterval(intervalId);
  }, [fetchTrendsData]);

  useEffect(() => {
    gradientRef.current = null;
  }, [trendsChartType]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 500,
        easing: "easeOutQuart",
        x: { duration: 500, easing: "easeOutQuart" },
        y: { duration: 500, easing: "easeOutQuart" },
        colors: { duration: 500, easing: "easeOutQuart" },
        numbers: { duration: 0 },
        grid: { duration: 0 },
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            padding: 20,
            font: { size: 12 },
          },
        },
        tooltip: {
          callbacks: {
            label: (tooltipItem) => {
              const value = tooltipItem.raw;
              const minutes = Math.round(value);
              const hours = Math.floor(minutes / 60);
              const remainingMinutes = minutes % 60;
              const duration = `${hours}h ${remainingMinutes}m`;
              return `${tooltipItem.dataset.label}: ${duration}`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: false,
            text: "Cleaning Duration (Minutes)",
          },
          ticks: {
            stepSize: 10,
          },
          suggestedMin: 0,
        },
        x: {
          title: {
            display: false,
            text: "Cleaning Schedule Hour",
          },
          ticks: {
            padding: 4,
          },
          grid: {
            offset: false,
            drawBorder: false,
          },
          offset: true,
        },
      },
    }),
    []
  );

  return (
    <div className="flex flex-col space-y-4 h-full">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-lg font-semibold">Trends Over Time</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleDayChange(-1)}
            disabled={loading}
            aria-label="Previous day"
          >
            <ChevronDown className="h-5 w-5 text-gray-500" />
          </Button>
          <DatePicker
            selected={selectedDate}
            onChange={(date) => setSelectedDate(date)}
            dateFormat="MM/dd/yyyy"
            showPopperArrow={false}
            popperPlacement="bottom"
            popperModifiers={[
              {
                name: "offset",
                options: { offset: [0, 8] },
              },
              {
                name: "preventOverflow",
                options: {
                  rootBoundary: "viewport",
                  tether: false,
                  altAxis: true,
                },
              },
              {
                name: "flip",
                options: { fallbackPlacements: ["bottom"] },
              },
              {
                name: "computeStyles",
                options: { adaptive: true, gpuAcceleration: false },
              },
            ]}
            customInput={
              <span className="text-gray-700 font-medium cursor-pointer rounded-md px-2 py-1 hover:bg-gray-100">
                {selectedDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "2-digit",
                  year: "numeric",
                })}
              </span>
            }
            wrapperClassName="react-datepicker-center"
            disabled={loading}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleDayChange(1)}
            disabled={loading}
            aria-label="Next day"
          >
            <ChevronUp className="h-5 w-5 text-gray-500" />
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 border border-gray-200">
              <EllipsisIcon className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => debouncedSetChartType("bar")}>
              Bar Chart
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => debouncedSetChartType("line")}>
              Line Chart
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="w-full h-full flex-grow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p>{error}</p>
          </div>
        ) : !chartData ? (
          <div className="flex items-center justify-center h-full">
            <p>
              No cleaning data available for{" "}
              {selectedDate.toLocaleDateString("en-US", {
                month: "short",
                day: "2-digit",
                year: "numeric",
              })}
              .
            </p>
          </div>
        ) : trendsChartType === "bar" ? (
          <Bar data={chartData} options={chartOptions} />
        ) : (
          <Line ref={chartRef} data={chartData} options={chartOptions} />
        )}
      </div>
    </div>
  );
};