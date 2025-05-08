"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { ChevronUp, ChevronDown, Pencil, Printer } from "lucide-react";
import ReminderCard from "../../../components/reports/reminderCard";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "../../../styles/datepicker-custom.css";
import {
  ResourcesUsageChart,
  TrendsOverTimeChart,
} from "../../../components/charts/mainCharts";
import { DateTime } from "luxon";
import { jsPDF } from "jspdf";
import Swal from "sweetalert2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

// Inline LoadingSpinner component
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-Icpetgreen"></div>
    </div>
  );
}

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

export default function MobileResources() {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState("inventory");
  const [chartType, setChartType] = useState("bar");
  const [trendsChartType, setTrendsChartType] = useState("line");
  const [selectedMetrics, setSelectedMetrics] = useState([
    "Usage Peak Hour",
    "Total Cleaning Time",
    "Recommended Cleaning Time",
    "Total Resources Restocked",
    "Recommended Resources",
  ]);
  const [inventoryData, setInventoryData] = useState([]);
  const [remindersData, setRemindersData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const itemsPerPage = 4;
  const [searchTerm] = useState("");
  const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://192.168.5.45:5000";

  // Resource mapping
  const resourceMapping = {
    CONT1: "Clorox",
    CONT2: "Multipurpose Cleaner",
    CONT3: "Toilet Bowl Cleaner",
    CONT4: "Glass and Mirror Liquid Cleaner",
  };

  // Fetch dispenser usage data
  const fetchDispenserUsage = async (date) => {
    try {
      setLoading(true);
      const formattedDate = date.toISOString().split("T")[0];
      const url = `${backendUrl}/api/dispenser/usage?date=${formattedDate}&ts=${Date.now()}`;
      console.log(`Fetching dispenser usage for date ${formattedDate} from: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch dispenser usage: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      console.log("Dispenser Usage API Response:", JSON.stringify(data, null, 2));
      setError(null);
      return data;
    } catch (error) {
      console.error("Fetch error:", error);
      setError(`Failed to load dispenser usage data: ${error.message}. Ensure the backend server is running at ${backendUrl}/api/dispenser/usage.`);
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Fetch restocking time
  const fetchRestockingTime = async (date) => {
    try {
      setLoading(true);
      const formattedDate = date.toISOString().split("T")[0];
      const url = `${backendUrl}/api/calendar-events/restocking-time?date=${formattedDate}&ts=${Date.now()}`;
      console.log(`Fetching restocking time for date ${formattedDate} from: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch restocking time: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      console.log("Restocking Time API Response:", JSON.stringify(data, null, 2));
      setError(null);
      return data.start ? new Date(data.start) : null;
    } catch (error) {
      console.error("Fetch restocking time error:", error);
      setError(`Failed to load restocking time: ${error.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Fetch reminders data
  const fetchReminders = async () => {
    try {
      setLoading(true);
      const url = `${backendUrl}/janitors/reminders?ts=${Date.now()}`;
      console.log(`Fetching reminders from: ${url}`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch reminders: ${response.statusText}`);
      const data = await response.json();
      console.log("Reminders API Response:", JSON.stringify(data, null, 2));
      setRemindersData(data);
      setError(null);
    } catch (error) {
      console.error("Fetch reminders error:", error);
      setError(`Failed to load reminders: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Transform dispenser usage data to inventory table format
  const transformData = (usageData, restockingTime) => {
    console.log("Transforming usage data:", JSON.stringify(usageData, null, 2));
    console.log("Restocking time received:", restockingTime);
    const resources = [
      { key: "CONT1", name: resourceMapping.CONT1 },
      { key: "CONT2", name: resourceMapping.CONT2 },
      { key: "CONT3", name: resourceMapping.CONT3 },
      { key: "CONT4", name: resourceMapping.CONT4 },
    ];

    let lastRestockTime = "-";
    const restockEntry = usageData.find((entry) => {
      if (entry.dispenser_volumes) {
        return Object.values(entry.dispenser_volumes).every((vol) => vol === 0);
      }
      return false;
    });

    if (restockEntry && restockEntry.start_time) {
      const originalTime = DateTime.fromJSDate(new Date(restockEntry.start_time)).setZone("Asia/Manila");
      lastRestockTime = originalTime
        .minus({ hours: 8 })
        .toFormat("h:mm a");
      console.log(`Original last restock time: ${originalTime.toFormat("h:mm a")}`);
      console.log(`Adjusted last restock time (minus 8 hours): ${lastRestockTime}`);
    } else {
      console.log("No restock entry found with all zero dispenser_volumes");
    }

    const tomorrow = DateTime.now().setZone("Asia/Manila").plus({ days: 1 });
    const nextRestockingDate = tomorrow.toFormat("MM/dd/yy");
    console.log(`Next restocking date: ${nextRestockingDate}`);

    let recommendedRestockingTime = "-";
    if (restockingTime) {
      const originalRestockTime = DateTime.fromJSDate(restockingTime).setZone("Asia/Manila");
      const adjustedTime = originalRestockTime.minus({ hours: 8 });
      recommendedRestockingTime = adjustedTime.toFormat("h:mm a");
      console.log(`Original restocking time: ${originalRestockTime.toFormat("h:mm a")}`);
      console.log(`Adjusted restocking time (minus 8 hours): ${recommendedRestockingTime}`);
    } else {
      console.log("No restocking time available from calendar events");
    }

    const transformed = resources.map((resource) => {
      let currentStock = 0;
      if (usageData.length > 0) {
        const allRemainingVolumes = usageData
          .flatMap((entry) => {
            if (entry.remaining_volumes && Array.isArray(entry.remaining_volumes)) {
              return entry.remaining_volumes.map((vol) => ({
                ...vol,
                timestamp: new Date(vol.timestamp),
              }));
            }
            console.warn("Missing or invalid remaining_volumes in entry:", entry);
            return [];
          })
          .filter((vol) => vol.timestamp instanceof Date && !isNaN(vol.timestamp))
          .sort((a, b) => b.timestamp - a.timestamp);

        console.log(`Sorted remaining_volumes for ${resource.name}:`, allRemainingVolumes);

        const latestEntry = allRemainingVolumes.find(
          (entry) => entry.volumes && typeof entry.volumes[resource.key] === "number"
        );

        if (latestEntry) {
          currentStock = latestEntry.volumes[resource.key];
          console.log(`Found currentStock for ${resource.name}: ${currentStock}`);
        } else {
          console.warn(`No valid volumes found for ${resource.key}`);
        }
      } else {
        console.warn("No usage data available");
      }

      const restockThreshold = 50;
      let status;
      if (currentStock > restockThreshold) {
        status = "Sufficient";
      } else if (currentStock > 0) {
        status = "Almost Out";
      } else {
        status = "Empty";
      }

      return {
        resources: resource.name,
        currentStock,
        restockThreshold,
        recommendedRestockingTime,
        recommendedRestock: 90,
        lastRestocked: lastRestockTime,
        nextRestockingDate,
        status,
      };
    });

    console.log("Transformed inventory data:", JSON.stringify(transformed, null, 2));
    return transformed;
  };

  // Aggregate hourly data for line graph
  const aggregateHourlyData = (usageData) => {
    const hourlyData = {};
    const resources = ["CONT1", "CONT2", "CONT3", "CONT4"];
    const hours = Array.from({ length: 14 }, (_, i) => 6 + i);

    hours.forEach((hour) => {
      const hourKey = `${hour.toString().padStart(2, "0")}:00`;
      hourlyData[hourKey] = {};
      resources.forEach((resource) => {
        hourlyData[hourKey][resource] = [];
      });
    });

    usageData.forEach((entry, entryIndex) => {
      if (entry.remaining_volumes && Array.isArray(entry.remaining_volumes)) {
        entry.remaining_volumes.forEach((volumeEntry, volIndex) => {
          if (volumeEntry.timestamp && volumeEntry.volumes) {
            let timestamp;
            if (typeof volumeEntry.timestamp === "number") {
              timestamp = DateTime.fromMillis(volumeEntry.timestamp).setZone("Asia/Manila");
            } else if (typeof volumeEntry.timestamp === "string") {
              timestamp = DateTime.fromISO(volumeEntry.timestamp, { zone: "Asia/Manila" });
            } else {
              console.warn(
                `Invalid timestamp format in entry ${entryIndex}, volume ${volIndex}:`,
                volumeEntry.timestamp
              );
              return;
            }

            if (!timestamp.isValid) {
              console.warn(
                `Invalid timestamp in entry ${entryIndex}, volume ${volIndex}:`,
                volumeEntry.timestamp
              );
              return;
            }

            const adjustedTimestamp = timestamp.minus({ hours: 8 });
            const hour = adjustedTimestamp.hour;

            if (hour >= 6 && hour <= 19) {
              const hourKey = adjustedTimestamp.toFormat("HH:00");
              resources.forEach((resource) => {
                if (typeof volumeEntry.volumes[resource] === "number") {
                  if (!hourlyData[hourKey]) {
                    hourlyData[hourKey] = {};
                    resources.forEach((res) => {
                      hourlyData[hourKey][res] = [];
                    });
                  }
                  hourlyData[hourKey][resource].push(volumeEntry.volumes[resource]);
                }
              });
            }
          }
        });
      }
    });

    const labels = hours.map((hour) => `${hour.toString().padStart(2, "0")}:00`);
    const datasets = resources.map((resource, index) => ({
      label: resourceMapping[resource],
      data: labels.map((hourKey) => {
        const volumes = hourlyData[hourKey][resource];
        return volumes.length > 0 ? volumes.reduce((sum, val) => sum + val, 0) / volumes.length : 0;
      }),
      borderColor: ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0"][index],
      backgroundColor: ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0"][index],
      fill: false,
      tension: 0.4,
    }));

    return { labels, datasets };
  };

  // Create line graph image
  const createLineGraphImage = async (chartData) => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 400;
      const ctx = canvas.getContext("2d");

      new ChartJS(ctx, {
        type: "line",
        data: {
          labels: chartData.labels,
          datasets: chartData.datasets,
        },
        options: {
          responsive: false,
          plugins: {
            title: {
              display: true,
              text: `Remaining Volumes by Hour (6 AM - 7 PM) on ${selectedDate.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}`,
              font: { size: 16 },
            },
            legend: { position: "top" },
          },
          scales: {
            x: { title: { display: true, text: "Hour of Day (Adjusted)" } },
            y: { title: { display: true, text: "Volume (ml)" }, beginAtZero: true },
          },
        },
      });

      setTimeout(() => {
        resolve(canvas.toDataURL("image/png"));
      }, 500);
    });
  };

  // Fetch data on mount and when selectedDate changes
  useEffect(() => {
    const fetchData = async () => {
      try {
        const usageData = await fetchDispenserUsage(selectedDate);
        const restockingTime = await fetchRestockingTime(selectedDate);
        const transformedData = transformData(usageData, restockingTime);
        setInventoryData(transformedData);
        console.log(`Inventory data set with ${transformedData.length} items`);
      } catch (error) {
        console.error("Fetch data error:", error);
        setError(`Failed to load data: ${error.message}`);
      }
    };
    fetchData();
    fetchReminders();

    const interval = setInterval(() => {
      fetchData();
      fetchReminders();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedDate]);

  // Handle generate graph and PDF
  const handleGenerate = async () => {
    if (inventoryData.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "No Data",
        text: "No inventory data available to generate the graph.",
        confirmButtonColor: "#23897D",
      });
      return;
    }

    try {
      setLoading(true);
      const usageData = await fetchDispenserUsage(selectedDate);
      if (!usageData || usageData.length === 0) {
        Swal.fire({
          icon: "warning",
          title: "No Data",
          text: "No usage data available for the selected date.",
          confirmButtonColor: "#23897D",
        });
        return;
      }

      const chartData = aggregateHourlyData(usageData);
      if (chartData.datasets.every((dataset) => dataset.data.every((value) => value === 0))) {
        Swal.fire({
          icon: "warning",
          title: "No Data",
          text: "No remaining volumes data available between 6 AM and 7 PM for the selected date.",
          confirmButtonColor: "#23897D",
        });
        return;
      }

      const chartImage = await createLineGraphImage(chartData);
      const doc = new jsPDF({ orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      let y = margin;

      const addWatermark = async () => {
        const watermarkUrl = "/images/watermark.png";
        const watermarkBase64 = await loadImageAsBase64(watermarkUrl);
        if (watermarkBase64) {
          const watermarkWidth = 200;
          const watermarkHeight = 200;
          const centerX = (pageWidth - watermarkWidth) / 2;
          const centerY = (pageHeight - watermarkHeight) / 2;
          try {
            doc.addImage(watermarkBase64, "PNG", centerX, centerY, watermarkWidth, watermarkHeight);
          } catch (error) {
            console.error("Error adding watermark image to PDF:", error);
          }
        }
      };
      await addWatermark();

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
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(0, 51, 102);
      const title = "Hourly Remaining Volumes Report (6 AM - 7 PM)";
      doc.text(title, margin, y);
      const titleWidth = doc.getTextWidth(title);
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

      const chartWidth = pageWidth - 2 * margin;
      const chartHeight = 100;
      try {
        doc.addImage(chartImage, "PNG", margin, y, chartWidth, chartHeight);
        y += chartHeight + 10;
      } catch (error) {
        console.error("Error adding chart image to PDF:", error);
        Swal.fire({
          icon: "error",
          title: "Graph Generation Failed",
          text: "Failed to include the graph in the PDF.",
          confirmButtonColor: "#23897D",
        });
        return;
      }

      const pdfOutput = doc.output("blob");
      const pdfUrl = URL.createObjectURL(pdfOutput);
      const printWindow = window.open(pdfUrl);
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      } else {
        console.error("Failed to open print window.");
        Swal.fire({
          icon: "error",
          title: "Print Failed",
          text: "Unable to open the print dialog. Please check your browser settings.",
          confirmButtonColor: "#23897D",
        });
      }
    } catch (error) {
      console.error("Error generating graph PDF:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to generate the graph report.",
        confirmButtonColor: "#23897D",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle print inventory report
  const handlePrint = async () => {
    if (inventoryData.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "No Data",
        text: "No inventory data available to generate the report.",
        confirmButtonColor: "#23897D",
      });
      return;
    }

    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let y = margin;

    const addWatermark = async () => {
      const watermarkUrl = "/images/watermark.png";
      const watermarkBase64 = await loadImageAsBase64(watermarkUrl);
      if (watermarkBase64) {
        const watermarkWidth = 200;
        const watermarkHeight = 200;
        const centerX = (pageWidth - watermarkWidth) / 2;
        const centerY = (pageHeight - watermarkHeight) / 2;
        try {
          doc.addImage(watermarkBase64, "PNG", centerX, centerY, watermarkWidth, watermarkHeight);
        } catch (error) {
          console.error("Error adding watermark image to PDF:", error);
        }
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
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(0, 51, 102);
    const title = "Inventory Report";
    doc.text(title, margin, y);
    const titleWidth = doc.getTextWidth(title);
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

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    const totalResources = inventoryData.length;
    doc.text(`Total Resources: ${totalResources}`, margin, y);
    y += 10;

    const columnWidths = [60, 30, 35, 35, 30, 35, 35, 30];
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
    const headers = [
      "Resources",
      "Current Stock",
      "Threshold",
      "Restock Time",
      "设计师",
      "Last Restocked",
      "Next Restock",
      "Status",
    ];
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

      const rowData = [
        entry.resources,
        `${entry.currentStock} ml`,
        `${entry.restockThreshold} ml`,
        entry.recommendedRestockingTime,
        `${entry.recommendedRestock} ml`,
        entry.lastRestocked,
        entry.nextRestockingDate,
        entry.status,
      ];

      currentX = tableX + 2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      rowData.forEach((data, colIndex) => {
        doc.text(data.toString(), currentX, y + 5.5);
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
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    } else {
      Swal.fire({
        icon: "error",
        title: "Print Failed",
        text: "Unable to open the print dialog. Please check your browser settings.",
        confirmButtonColor: "#23897D",
      });
    }
  };

  // Pagination and filtering
  const filteredData = useMemo(() => {
    const filtered = inventoryData.filter((resource) =>
      Object.values(resource).some((value) =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
    console.log(`Filtered data: ${filtered.length} items`, filtered);
    return filtered;
  }, [inventoryData, searchTerm]);

  const currentItems = useMemo(() => {
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const items = filteredData.slice(indexOfFirstItem, indexOfLastItem);
    console.log(`Current items: ${items.length} items`, items);
    return items;
  }, [currentPage, filteredData]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const pageNumbers = useMemo(() =>
    Array.from({ length: totalPages }, (_, i) => i + 1),
    [totalPages]
  );

  const handleMonthChange = (increment) => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() + increment);
    console.log(`Datepicker month changed to: ${newDate.toISOString().split("T")[0]}`);
    setSelectedDate(newDate);
  };

  const toggleMetricWrapper = (item) => {
    setSelectedMetrics((prev) =>
      prev.includes(item)
        ? prev.filter((metric) => metric !== item)
        : [...prev, item]
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tab Navigation */}
      <div className="flex gap-2 bg-white p-2 rounded-lg shadow-sm">
        <button
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium ${
            activeTab === "inventory"
              ? "bg-Icpetgreen text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
          onClick={() => setActiveTab("inventory")}
        >
          Inventory
        </button>
        <button
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium ${
            activeTab === "reminders"
              ? "bg-Icpetgreen text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
          onClick={() => setActiveTab("reminders")}
        >
          Reminders
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "inventory" && (
          <div className="h-full flex flex-col overflow-hidden bg-gray-50">
            {/* Charts Section - Scrollable */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-4">
                {/* Resources Usage Chart */}
                <div className="bg-white shadow-lg outline outline-1 outline-gray-200 p-4 rounded-lg">
                  <div className="flex flex-col gap-4 h-[500px]">
                    {loading ? (
                      <LoadingSpinner />
                    ) : (
                      <ResourcesUsageChart
                        chartType={chartType}
                        setShowChartDropdown={toggleMetricWrapper}
                        showChartDropdown={selectedMetrics.includes(
                          "Usage Peak Hour"
                        )}
                        setChartType={setChartType}
                      />
                    )}
                  </div>
                </div>

                {/* Trends Over Time Chart */}
                <div className="bg-white shadow-lg outline outline-1 outline-gray-200 p-4 rounded-lg">
                  <div className="flex flex-col gap-4 h-[500px]">
                    {loading ? (
                      <LoadingSpinner />
                    ) : (
                      <TrendsOverTimeChart
                        trendsChartType={trendsChartType}
                        setShowTrendsDropdown={toggleMetricWrapper}
                        showTrendsDropdown={selectedMetrics.includes(
                          "Usage Peak Hour"
                        )}
                        setTrendsChartType={setTrendsChartType}
                      />
                    )}
                  </div>
                </div>

                {/* Inventory Table Section */}
                <div className="bg-white rounded-lg border border-gray-200">
                  {/* Table Header - Sticky */}
                  <div className="sticky top-0 bg-white border-b border-gray-200 p-4 z-10">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <ChevronUp
                          className="w-7 h-7 text-gray-500 cursor-pointer hover:text-gray-700 rounded-lg border border-gray-200"
                          onClick={() => handleMonthChange(1)}
                        />
                        <DatePicker
                          selected={selectedDate}
                          onChange={(date) => {
                            console.log(`Datepicker selected: ${date.toISOString().split("T")[0]}`);
                            setSelectedDate(date);
                          }}
                          dateFormat="MMMM yyyy"
                          showMonthYearPicker
                          showPopperArrow={false}
                          customInput={
                            <span className="text-gray-700 font-medium cursor-pointer">
                              {selectedDate.toLocaleString("default", {
                                month: "long",
                                year: "numeric",
                              })}
                            </span>
                          }
                        />
                        <ChevronDown
                          className="w-7 h-7 text-gray-500 cursor-pointer hover:text-gray-700 rounded-lg border border-gray-200"
                          onClick={() => handleMonthChange(-1)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleGenerate}
                          className="bg-Icpetgreen text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2"
                          disabled={loading}
                        >
                          <Pencil className="w-4 h-4" />
                          Generate
                        </button>
                        <button
                          onClick={handlePrint}
                          className="p-1.5 rounded-lg border border-gray-200"
                          disabled={loading}
                        >
                          <Printer className="w-4 h-4 text-Icpetgreen" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Table Content */}
                  <div className="divide-y divide-gray-200">
                    {loading ? (
                      <div className="p-4 text-center">
                        <LoadingSpinner />
                      </div>
                    ) : error ? (
                      <div className="p-4 text-center text-red-500">
                        Error: {error}
                      </div>
                    ) : currentItems.length > 0 ? (
                      currentItems.map((row, index) => (
                        <div key={index} className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-medium text-gray-900">
                              {row.resources}
                            </h3>
                            <button className="text-Icpetgreen">
                              <Pencil className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-y-2 text-sm">
                            <div className="text-gray-500">Current Stock</div>
                            <div className="text-gray-900">
                              {row.currentStock} ml
                            </div>
                            <div className="text-gray-500">Threshold</div>
                            <div className="text-gray-900">
                              {row.restockThreshold} ml
                            </div>
                            <div className="text-gray-500">Restock Time</div>
                            <div className="text-gray-900">
                              {row.recommendedRestockingTime}
                            </div>
                            <div className="text-gray-500">Restock</div>
                            <div className="text-gray-900">
                              {row.recommendedRestock} ml
                            </div>
                            <div className="text-gray-500">Last Restocked</div>
                            <div className="text-gray-900">
                              {row.lastRestocked}
                            </div>
                            <div className="text-gray-500">Next Restock</div>
                            <div className="text-gray-900">
                              {row.nextRestockingDate}
                            </div>
                            <div className="text-gray-500">Status</div>
                            <div className="text-gray-900">{row.status}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-gray-500">
                        No results.
                      </div>
                    )}
                  </div>

                  {/* Pagination - Sticky */}
                  <div className="sticky bottom-0 border-t border-gray-200 p-2 bg-white">
                    {totalPages > 1 && (
                      <ol className="flex justify-center items-center gap-1 text-xs font-medium">
                        <li>
                          <button
                            onClick={() =>
                              setCurrentPage(Math.max(1, currentPage - 1))
                            }
                            disabled={currentPage === 1}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded border ${
                              currentPage === 1
                                ? "border-gray-200 bg-gray-50 text-gray-300"
                                : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                            }`}
                          >
                            <span className="sr-only">Previous</span>
                            <ChevronDown className="h-4 w-4 rotate-90" />
                          </button>
                        </li>
                        {pageNumbers.map((number) => (
                          <li key={number}>
                            <button
                              onClick={() => setCurrentPage(number)}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
                                currentPage === number
                                  ? "bg-Icpetgreen text-white"
                                  : "text-gray-500 hover:bg-gray-100"
                              }`}
                            >
                              {number}
                            </button>
                          </li>
                        ))}
                        <li>
                          <button
                            onClick={() =>
                              setCurrentPage(
                                Math.min(totalPages, currentPage + 1)
                              )
                            }
                            disabled={currentPage === totalPages}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded border ${
                              currentPage === totalPages
                                ? "border-gray-200 bg-gray-50 text-gray-300"
                                : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                            }`}
                          >
                            <span className="sr-only">Next</span>
                            <ChevronDown className="h-4 w-4 -rotate-90" />
                          </button>
                        </li>
                      </ol>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "reminders" && (
          <div className="h-full overflow-y-auto bg-gray-50">
            <div className="p-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-bold text-xl">Reminders</h2>
                  <button className="text-sm text-green-600 bg-green-100 px-3 py-1.5 rounded-lg">
                    Janitors Usage
                  </button>
                </div>
                <div className="space-y-4">
                  {loading ? (
                    <LoadingSpinner />
                  ) : error ? (
                    <div className="text-center text-red-500">
                      Error: {error}
                    </div>
                  ) : remindersData.length > 0 ? (
                    remindersData.map((reminderSection, idx) => (
                      <ReminderCard
                        key={idx}
                        date={reminderSection.date}
                        items={reminderSection.items}
                      />
                    ))
                  ) : (
                    <div className="text-center text-gray-500">
                      No Reminders Available
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}