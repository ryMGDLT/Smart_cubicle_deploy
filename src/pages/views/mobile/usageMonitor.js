import React, { useState, useEffect, useMemo, useRef } from "react";
import { ChevronUp, ChevronDown, Printer } from "lucide-react";
import CardUsageReport from "../../../components/reports/cardUsageReport";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import _ from "lodash";
import { UsageMonitoringChart } from "../../../components/charts/mainCharts";
import { axiosInstance } from "../../../components/controller/authController";
import { DateTime } from "luxon";
import { calculateHourlyAverages } from "../../../components/utils/odorCalculations";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

// Define backend URL
const backendUrl =
  process.env.REACT_APP_BACKEND_URL || "https://smart-cubicle-backend.onrender.com";

// Helper function to load image as base64
const loadImageAsBase64 = async (url) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error loading image:", error);
    return null;
  }
};

// Normalize time function
const normalizeTime = (time) => {
  if (!time) return null;
  const timeStr = String(time).trim();
  const timeFormats = [
    /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
    /^(\d{1,2}):(\d{2})$/,
    /^(\d{1,2})\s*(AM|PM)$/i,
  ];

  for (const regex of timeFormats) {
    const match = timeStr.match(regex);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const period = match[3] ? match[3].toUpperCase() : null;

      if (period) {
        if (period === "PM" && hours < 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;
      }
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
    }
  }
  return null;
};

// Format cleaning hour to AM/PM
const formatCleaningHour = (time) => {
  if (!time || time === "N/A") return "N/A";
  try {
    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const formattedHour = hours % 12 || 12;
    return `${formattedHour}:${minutes.toString().padStart(2, "0")} ${period}`;
  } catch (error) {
    console.error("Error formatting cleaning hour:", time, error);
    return "N/A";
  }
};

// Get status color
const getStatusColor = (status) => {
  switch (status.toLowerCase()) {
    case "done":
    case "on time":
    case "early":
      return "text-green-500";
    case "overdue":
    case "late":
      return "text-red-500";
    case "pending":
      return "text-yellow-500";
    default:
      return "text-gray-500";
  }
};

// Get color for actionRequired
const getActionColor = (action) => {
  if (action.includes("Urgent") || action.includes("Immediate")) {
    return "text-red-600";
  } else if (action.includes("soon") || action.includes("Schedule")) {
    return "text-yellow-600";
  } else {
    return "text-green-600";
  }
};

export default function UsageMonitor() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [fetchDate, setFetchDate] = useState(selectedDate);
  const [activeTab, setActiveTab] = useState("monitor");
  const [janitorData, setJanitorData] = useState([]);
  const [inventoryData, setInventoryData] = useState([]);
  const [janitorDataLoading, setJanitorDataLoading] = useState(false);
  const [sensorDataLoading, setSensorDataLoading] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);

  // Debounce date changes to prevent rapid API calls
  const debouncedSetFetchDate = useMemo(
    () => _.debounce((date) => setFetchDate(date), 500),
    []
  );

  // Debounce janitor data fetch
  const debouncedFetchJanitorData = useMemo(
    () => _.debounce(() => fetchJanitorData(), 500),
    []
  );

  // Handle date change via DatePicker
  const handleDateChange = (date) => {
    setSelectedDate(date);
    debouncedSetFetchDate(date);
  };

  // Handle previous/next day navigation
  const handleDayChange = (increment) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + increment);
    setSelectedDate(newDate);
    debouncedSetFetchDate(newDate);
  };

  // Fetch janitor data
  const fetchJanitorData = async () => {
    setJanitorDataLoading(true);
    setError(null);
    try {
      console.log(`Fetching janitors from ${backendUrl}/janitors`);
      const janitorResponse = await fetch(`${backendUrl}/janitors?ts=${Date.now()}`);
      if (!janitorResponse.ok) {
        throw new Error(
          `Failed to fetch janitors: ${janitorResponse.status} ${janitorResponse.statusText}`
        );
      }
      const janitorDataRaw = await janitorResponse.json();
      console.log("Janitor API Response:", janitorDataRaw);

      const allSchedules = janitorDataRaw.flatMap((janitor) =>
        (janitor.schedule || []).map((entry) => ({
          janitorId: janitor._id,
          name: janitor.basicDetails?.name || "N/A",
          image: janitor.basicDetails?.image || "/images/default-profile.png",
          date: entry.date || "N/A",
          cleaningHour: entry.cleaningHour || "N/A",
          status: entry.status || "Pending",
          shift: entry.shift || null,
        }))
      );

      const sortedSchedules = allSchedules.sort((a, b) => {
        const parseDate = (dateStr) => {
          if (!dateStr || dateStr === "N/A") return new Date(0);
          let date;
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
            const [month, day, year] = dateStr.split("/").map(Number);
            date = new Date(year, month - 1, day);
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            date = new Date(dateStr);
          } else {
            return new Date(0);
          }
          return date && !isNaN(date.getTime()) ? date : new Date(0);
        };

        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);
        const dateDiff = dateB.getTime() - dateA.getTime();
        if (dateDiff !== 0) return dateDiff;

        const parseShift = (shift) => {
          if (!shift) return 0;
          const shiftPriority = { evening: 3, afternoon: 2, morning: 1 };
          return shiftPriority[shift.toLowerCase()] || 0;
        };

        const shiftA = parseShift(a.shift);
        const shiftB = parseShift(b.shift);
        if (shiftA !== shiftB) return shiftB - shiftA;

        const parseCleaningHour = (time) => {
          const normalized = normalizeTime(time);
          if (!normalized || time === "N/A") return 0;
          const [hours, minutes] = normalized.split(":").map(Number);
          return hours * 60 + minutes;
        };

        const timeA = parseCleaningHour(a.cleaningHour);
        const timeB = parseCleaningHour(b.cleaningHour);
        return timeB - timeA;
      });

      setJanitorData(sortedSchedules);
    } catch (error) {
      console.error("Error fetching janitor data:", error.message);
      setJanitorData([]);
      setError(
        "Failed to fetch janitor schedule. Please check your network connection or login status and try again."
      );
    } finally {
      setJanitorDataLoading(false);
    }
  };

  // Fetch sensor data for inventory tab
  const fetchSensorData = async () => {
    setSensorDataLoading(true);
    setError(null);
    setInventoryData([]);

    try {
      const formattedDate = DateTime.fromJSDate(fetchDate)
        .setZone("Asia/Manila")
        .toISODate(); // Produces YYYY-MM-DD, e.g., 2025-05-08

      if (!formattedDate || !/^\d{4}-\d{2}-\d{2}$/.test(formattedDate)) {
        throw new Error(`Invalid date format generated: ${formattedDate}`);
      }

      console.log(`Fetching sensor data for date: ${formattedDate}`);

      const endpoints = [
        { url: `/api/occupancy/${formattedDate}`, name: "Occupancy", required: true },
        {
          url: `/api/occupancy/predictions/${formattedDate}`,
          name: "Predictions",
          required: true,
        },
        {
          url: `/api/odor-module/raw-data/${formattedDate}`,
          name: "Odor Raw Data",
          required: false,
        },
      ];

      let noDataError = false;

      const responses = await Promise.all(
        endpoints.map(async ({ url, name, required }) => {
          try {
            console.log(`Requesting ${name}: ${backendUrl}${url}`);
            const response = await axiosInstance.get(url);
            console.log(`${name} Response:`, response.data);
            return { name, data: response.data, error: null };
          } catch (error) {
            const errorDetails = {
              status: error.response?.status,
              statusText: error.response?.statusText,
              data: error.response?.data,
              message: error.message,
              url: `${backendUrl}${url}`,
              headers: error.config?.headers,
            };
            console.error(`Error fetching ${name}:`, errorDetails);
            const errorMessage =
              error.response?.data?.message ||
              error.response?.statusText ||
              error.message;
            if (required && errorMessage.includes("No DATA found")) {
              noDataError = true;
              return { name, data: null, error: null };
            }
            if (required) {
              throw new Error(`Failed to fetch ${name}: ${errorMessage}`);
            }
            return { name, data: null, error: errorDetails };
          }
        })
      );

      if (noDataError) {
        setInventoryData([]);
        return;
      }

      const responseMap = responses.reduce((acc, { name, data, error }) => {
        acc[name] = { data, error };
        return acc;
      }, {});

      const occupancyData = Array.isArray(responseMap["Occupancy"].data)
        ? responseMap["Occupancy"].data
        : [];
      const predictionHours = responseMap["Predictions"].data?.hours || [];
      const odorRawDocuments = responseMap["Odor Raw Data"].data?.rawDocuments || [];

      console.log("Occupancy data:", occupancyData);
      console.log("Prediction hours:", predictionHours);
      console.log("Odor raw documents:", odorRawDocuments);

      const odorAverages = calculateHourlyAverages(odorRawDocuments);
      console.log("Processed odor averages (Fahrenheit):", odorAverages);

      const allHours = Array.from({ length: 14 }, (_, i) => {
        const hour = 6 + i;
        return DateTime.fromObject(
          {
            year: DateTime.fromJSDate(fetchDate).year,
            month: DateTime.fromJSDate(fetchDate).month,
            day: DateTime.fromJSDate(fetchDate).day,
            hour,
          },
          { zone: "Asia/Manila" }
        ).toJSDate();
      });

      const mergedData = allHours.map((hour, index) => {
        const item = occupancyData.find(
          (d) => new Date(d.timestamp).getTime() === hour.getTime()
        );
        const count = item ? item.value : 0;
        const isPeak = predictionHours.includes(6 + index);
        const nextHourCount =
          index < allHours.length - 1 && occupancyData[index + 1]
            ? occupancyData[index + 1].value
            : null;
        const prevHourCount =
          index > 0 && occupancyData[index - 1] ? occupancyData[index - 1].value : null;

        let status = "Normal";
        let actionRequired = "No Action Required";
        let color = "text-green-600";

        if (count < 9) {
          status = "Normal";
          actionRequired = "No Action Required";
          color = "text-green-600";
        } else if (count >= 10 && isPeak) {
          status = "High Capacity";
          actionRequired = "Clean Restroom";
          color = "text-red-600";
        } else if (
          (nextHourCount &&
            nextHourCount >= 10 &&
            predictionHours.includes(6 + index + 1)) ||
          (prevHourCount &&
            prevHourCount >= 10 &&
            predictionHours.includes(6 + index - 1))
        ) {
          status = "Moderate";
          actionRequired = "Monitor Restroom";
          color = "text-yellow-600";
        }

        const odorData =
          odorAverages.find(
            (o) =>
              o.timeStamp ===
              DateTime.fromJSDate(hour).setZone("Asia/Manila").toFormat("h:mm a")
          ) || {
            odor: { value: 0, status: "Unknown", color: "text-gray-600" },
            temperature: { value: 0, status: "Unknown", color: "text-gray-600" },
            actionRequired: "None",
          };

        const combinedActionRequired =
          actionRequired !== "No Action Required"
            ? actionRequired
            : odorData.actionRequired !== "None"
            ? odorData.actionRequired
            : "No Action Required";

        return {
          timeStamp: DateTime.fromJSDate(hour)
            .setZone("Asia/Manila")
            .toFormat("h:mm a"),
          capacity: {
            value: count,
            status,
            color,
          },
          temperature: odorData.temperature,
          odor: odorData.odor,
          actionRequired: combinedActionRequired,
          hour: 6 + index,
        };
      });

      // Filter data to only show entries with meaningful values
      const validData = mergedData.filter((item) => {
        return (
          item.capacity.value > 0 ||
          item.odor.value > 0 ||
          item.temperature.value > 0 ||
          item.odor.status !== "Unknown" ||
          item.temperature.status !== "Unknown"
        );
      });

      const sortedData = validData.sort((a, b) => a.hour - b.hour);
      setInventoryData(sortedData);
    } catch (error) {
      console.error("Error fetching sensor data:", error.message);
      setInventoryData([]);
      setError(
        error.message.includes("Failed to fetch") &&
        !error.message.includes("No DATA found")
          ? error.message
          : "Failed to fetch sensor data. Please check your network connection or login status and try again."
      );
    } finally {
      setSensorDataLoading(false);
    }
  };

  // Print inventory table as PDF
  const handlePrintInventoryTable = async () => {
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      let y = margin;

      const addWatermark = async () => {
        console.log("Adding watermark...");
        const watermarkUrl = "/images/watermark.png";
        const watermarkBase64 = await loadImageAsBase64(watermarkUrl);
        if (watermarkBase64) {
          const watermarkWidth = 200;
          const watermarkHeight = 200;
          const centerX = (pageWidth - watermarkWidth) / 2;
          const centerY = (pageHeight - watermarkHeight) / 2;
          try {
            doc.addImage(watermarkBase64, "PNG", centerX, centerY, watermarkWidth, watermarkHeight);
            console.log("Watermark image rendered at:", { x: centerX, y: centerY });
          } catch (error) {
            console.error("Error adding watermark image to PDF:", error);
          }
        } else {
          console.warn("Watermark image could not be loaded; skipping watermark.");
        }
      };

      const logoUrl = "/images/ICPET.png";
      const logoBase64 = await loadImageAsBase64(logoUrl);
      if (logoBase64) {
        const logoWidth = 25;
        const logoHeight = 25;
        const logoX = pageWidth - margin - logoWidth - 5;
        const logoY = margin - 5;
        try {
          doc.addImage(logoBase64, "PNG", logoX, logoY, logoWidth, logoHeight);
        } catch (error) {
          console.error("Error adding logo to PDF:", error);
        }
      } else {
        console.warn("Logo image could not be loaded; skipping logo.");
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(0, 51, 102);
      doc.text("Sensor Data Table Report", margin, y);
      const titleWidth = doc.getTextWidth("Sensor Data Table Report");
      doc.setDrawColor(0, 51, 102);
      doc.setLineWidth(0.5);
      doc.line(margin, y + 2, margin + titleWidth, y + 2);
      y += 12;

      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      const today = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      doc.text(`Generated on: ${today}`, margin, y);
      y += 8;

      const columnWidths = [30, 30, 30, 30, 40];
      const totalTableWidth = columnWidths.reduce((a, b) => a + b, 0);
      const tableX = (pageWidth - totalTableWidth) / 2;
      const rowHeight = 8;
      const headerY = y;

      doc.setFillColor(35, 137, 125);
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.3);
      doc.rect(tableX, headerY, totalTableWidth, rowHeight, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      const headers = ["Time Stamp", "Occupancy", "Odor", "Temperature (°F)", "Action Required"];
      let currentX = tableX + 2;
      headers.forEach((header, index) => {
        doc.text(header, currentX, headerY + 5.5);
        currentX += columnWidths[index];
      });
      y += rowHeight;

      for (const [index, entry] of inventoryData.entries()) {
        if (index % 2 === 0) {
          doc.setFillColor(245, 245, 245);
        } else {
          doc.setFillColor(255, 255, 255);
        }
        doc.rect(tableX, y, totalTableWidth, rowHeight, "F");

        const timeStamp = entry.timeStamp || "N/A";
        const occupancy = `${entry.capacity.value} (${entry.capacity.status})`;
        const odor = `${entry.odor.value} (${entry.odor.status})`;
        const temperature = `${entry.temperature.value} (${entry.temperature.status})`;
        const actionRequired = entry.actionRequired || "N/A";

        const rowData = [timeStamp, occupancy, odor, temperature, actionRequired];
        currentX = tableX + 2;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        rowData.forEach((data, colIndex) => {
          doc.text(data, currentX, y + 5.5);
          currentX += columnWidths[colIndex];
        });

        doc.setDrawColor(150, 150, 150);
        doc.setLineWidth(0.2);
        currentX = tableX;
        columnWidths.forEach((width) => {
          doc.rect(currentX, y, width, rowHeight);
          currentX += width;
        });

        y += rowHeight;

        if (y > pageHeight - margin - rowHeight) {
          await addWatermark();
          doc.addPage();
          y = margin;
          doc.setFillColor(35, 137, 125);
          doc.rect(tableX, y, totalTableWidth, rowHeight, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(255, 255, 255);
          currentX = tableX + 2;
          headers.forEach((header, index) => {
            doc.text(header, currentX, y + 5.5);
            currentX += columnWidths[index];
          });
          y += rowHeight;
        }
      }

      await addWatermark();
      const pdfOutput = doc.output("blob");
      const pdfUrl = URL.createObjectURL(pdfOutput);
      const printWindow = window.open(pdfUrl);
      printWindow.onload = () => {
        printWindow.print();
      };
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    }
  };

  // Print chart as PDF
  const handlePrintChart = async () => {
    if (!chartRef.current) {
      console.error("Chart reference is not available");
      alert("Chart is not available. Please try again.");
      return;
    }

    try {
      const canvas = await html2canvas(chartRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      let y = margin;

      const addWatermark = async () => {
        console.log("Adding watermark...");
        const watermarkUrl = "/images/watermark.png";
        const watermarkBase64 = await loadImageAsBase64(watermarkUrl);
        if (watermarkBase64) {
          const watermarkWidth = 200;
          const watermarkHeight = 200;
          const centerX = (pageWidth - watermarkWidth) / 2;
          const centerY = (pageHeight - watermarkHeight) / 2;
          try {
            doc.addImage(watermarkBase64, "PNG", centerX, centerY, watermarkWidth, watermarkHeight);
            console.log("Watermark image rendered at:", { x: centerX, y: centerY });
          } catch (error) {
            console.error("Error adding watermark image to PDF:", error);
          }
        } else {
          console.warn("Watermark image could not be loaded; skipping watermark.");
        }
      };

      const logoUrl = "/images/ICPET.png";
      const logoBase64 = await loadImageAsBase64(logoUrl);
      if (logoBase64) {
        const logoWidth = 25;
        const logoHeight = 25;
        const logoX = pageWidth - margin - logoWidth - 5;
        const logoY = margin - 5;
        try {
          doc.addImage(logoBase64, "PNG", logoX, logoY, logoWidth, logoHeight);
        } catch (error) {
          console.error("Error adding logo to PDF:", error);
        }
      } else {
        console.warn("Logo image could not be loaded; skipping logo.");
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(0, 51, 102);
      doc.text("Usage Monitoring Chart Report", margin, y);
      const titleWidth = doc.getTextWidth("Usage Monitoring Chart Report");
      doc.setDrawColor(0, 51, 102);
      doc.setLineWidth(0.5);
      doc.line(margin, y + 2, margin + titleWidth, y + 2);
      y += 12;

      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      const today = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      doc.text(`Generated on: ${today}`, margin, y);
      y += 8;

      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const maxImgWidth = pageWidth - 2 * margin;
      const maxImgHeight = pageHeight - y - margin;
      const ratio = Math.min(maxImgWidth / imgWidth, maxImgHeight / imgHeight);
      const scaledWidth = imgWidth * ratio;
      const scaledHeight = imgHeight * ratio;
      const imgX = (pageWidth - scaledWidth) / 2;

      doc.addImage(imgData, "PNG", imgX, y, scaledWidth, scaledHeight);
      await addWatermark();

      const pdfOutput = doc.output("blob");
      const pdfUrl = URL.createObjectURL(pdfOutput);
      const printWindow = window.open(pdfUrl);
      printWindow.onload = () => {
        printWindow.print();
      };
    } catch (error) {
      console.error("Error generating chart PDF:", error);
      alert("Failed to generate chart PDF. Please try again.");
    }
  };

  // Fetch data when activeTab or fetchDate changes
  useEffect(() => {
    if (activeTab === "schedule") {
      debouncedFetchJanitorData();
    } else if (activeTab === "inventory") {
      fetchSensorData();
    }
  }, [activeTab, fetchDate, debouncedFetchJanitorData]);

  return (
    <div className="h-full flex flex-col p-2 gap-3 overflow-y-auto">
      {/* Error Display */}
      {error && (
        <div className="text-red-600 text-center p-2 bg-red-50 rounded">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 bg-white p-2 rounded-lg shadow-sm">
        <button
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium ${
            activeTab === "monitor"
              ? "bg-Icpetgreen text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
          onClick={() => setActiveTab("monitor")}
        >
          Usage Monitor
        </button>
        <button
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium ${
            activeTab === "inventory"
              ? "bg-Icpetgreen text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
          onClick={() => setActiveTab("inventory")}
        >
          Sensor Data
        </button>
        <button
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium ${
            activeTab === "schedule"
              ? "bg-Icpetgreen text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
          onClick={() => setActiveTab("schedule")}
        >
          Schedule
        </button>
      </div>

      {/* Content Area */}
      {activeTab === "monitor" && (
        <div className="flex flex-col gap-4">
          {/* Usage Monitoring Chart */}
          <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">Usage Monitor</h2>
              <div className="flex items-center gap-2">
                <button
                  className="bg-Icpetgreen text-white px-3 py-1.5 rounded-lg text-sm hover:bg-opacity-90"
                  onClick={handlePrintChart}
                  disabled={sensorDataLoading || inventoryData.length === 0}
                >
                  Generate Graph
                </button>
                <button
                  className="p-1.5 rounded-lg border border-gray-200"
                  onClick={handlePrintInventoryTable}
                  disabled={sensorDataLoading || inventoryData.length === 0}
                >
                  <Printer className="w-5 h-5 text-Icpetgreen" />
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-4 h-[350px]" ref={chartRef}>
              <UsageMonitoringChart />
            </div>
          </div>

          {/* Usage Report Cards */}
          <div className="bg-white rounded-lg shadow-sm">
            <CardUsageReport />
          </div>
        </div>
      )}

      {activeTab === "inventory" && (
        <div className="flex flex-col h-full">
          {/* Inventory Header */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-3">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">Sensor Data</h2>
              <div className="flex items-center gap-2">
                <ChevronUp
                  className="w-7 h-7 text-gray-500 cursor-pointer hover:text-gray-700 rounded-lg border border-gray-200"
                  onClick={() => handleDayChange(1)}
                />
                <div className="relative inline-block">
                  <DatePicker
                    selected={selectedDate}
                    onChange={handleDateChange}
                    dateFormat="MMM dd, yyyy"
                    showPopperArrow={false}
                    popperContainer={({ children }) => (
                      <div className="absolute z-[9999] mt-2">{children}</div>
                    )}
                    customInput={
                      <span className="text-gray-700 font-medium cursor-pointer">
                        {selectedDate.toLocaleString("default", {
                          month: "short",
                          day: "2-digit",
                          year: "numeric",
                        })}
                      </span>
                    }
                  />
                </div>
                <ChevronDown
                  className="w-7 h-7 text-gray-500 cursor-pointer hover:text-gray-700 rounded-lg border border-gray-200"
                  onClick={() => handleDayChange(-1)}
                />
              </div>
            </div>
          </div>

          {/* Inventory Cards */}
          <div className="flex-1 overflow-y-auto">
            {sensorDataLoading ? (
              <div className="flex justify-center items-center h-24">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : inventoryData.length > 0 ? (
              <div className="grid gap-3 pb-3">
                {inventoryData.map((row, index) => (
                  <div key={index} className="bg-white rounded-lg shadow-sm p-4">
                    {/* Card Header */}
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <div className="font-semibold text-gray-900 text-lg">
                          {row.timeStamp}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Last Updated
                        </div>
                      </div>
                      <div
                        className={`text-sm font-medium ${getActionColor(
                          row.actionRequired
                        )}`}
                      >
                        {row.actionRequired}
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Capacity */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-sm text-gray-500 mb-1">
                          Capacity
                        </div>
                        <div
                          className={`text-lg font-semibold ${row.capacity.color}`}
                        >
                          {row.capacity.value}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {row.capacity.status}
                        </div>
                      </div>

                      {/* Temperature */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-sm text-gray-500 mb-1">
                          Temperature (°F)
                        </div>
                        <div
                          className={`text-lg font-semibold ${row.temperature.color}`}
                        >
                          {row.temperature.value}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {row.temperature.status}
                        </div>
                      </div>

                      {/* Odor */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-sm text-gray-500 mb-1">
                          Odor Level
                        </div>
                        <div
                          className={`text-lg font-semibold ${row.odor.color}`}
                        >
                          {row.odor.value}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {row.odor.status}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-24 text-center text-gray-500 flex items-center justify-center">
                No sensor data available for{" "}
                {selectedDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "2-digit",
                  year: "numeric",
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "schedule" && (
        <div className="bg-white rounded-lg shadow-sm flex flex-col">
          {/* Schedule Header */}
          <div className="p-4 border-b flex justify-between items-center">
            <h2 className="text-lg font-bold">Janitors Schedule</h2>
            <div className="flex items-center gap-2">
              <button className="bg-Icpetgreen text-white px-3 py-1.5 rounded-lg text-sm hover:bg-opacity-90">
                Generate
              </button>
              <button className="p-1.5 rounded-lg border border-gray-200">
                <Printer className="w-5 h-5 text-Icpetgreen" />
              </button>
            </div>
          </div>

          {/* Schedule List */}
          <div className="flex-1 overflow-y-auto">
            {janitorDataLoading ? (
              <div className="flex justify-center items-center h-24">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : janitorData.length > 0 ? (
              janitorData.map((janitor, index) => (
                <div
                  key={index}
                  className="flex items-center p-3 border-b hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2 flex-1">
                    <img
                      src={janitor.image}
                      alt={janitor.name}
                      className="w-8 h-8 rounded-full"
                    />
                    <div>
                      <div className="font-medium text-sm">{janitor.name}</div>
                      <div className="text-xs text-gray-500">
                        {janitor.date} at {formatCleaningHour(janitor.cleaningHour)} (
                        {janitor.shift})
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-sm ${getStatusColor(janitor.status)}`}
                  >
                    {janitor.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="h-24 text-center text-gray-500 flex items-center justify-center">
                No janitor data available.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}