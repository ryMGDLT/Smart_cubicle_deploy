"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
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
import ReminderCard from "../../../components/reports/reminderCard";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";
import { PencilIcon, Printer } from "lucide-react";
import { setDefaultOptions } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { inventoryColumns } from "../../../components/tables/resources/inventory-column";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationLink,
} from "../../../components/ui/pagination";
import { Card, CardHeader, CardContent } from "../../../components/ui/card";
import {
  ResourcesUsageChart,
  TrendsOverTimeChart,
} from "../../../components/charts/mainCharts";
import { DateTime } from "luxon";
import { jsPDF } from "jspdf";
import Swal from "sweetalert2";

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

// Set default locale for date-fns
setDefaultOptions({ locale: enUS });

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

// Inline LoadingSpinner component
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-Icpetgreen"></div>
    </div>
  );
}

export default function ResourceManagement() {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm] = useState("");
  const [inventoryData, setInventoryData] = useState([]);
  const [remindersData, setRemindersData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const itemsPerPage = 4;
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [chartType, setChartType] = useState("bar");
  const [trendsChartType, setTrendsChartType] = useState("line");
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

    // Find last restock entry (dispenser_volumes all zeros)
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

    // Calculate next restocking date (tomorrow)
    const tomorrow = DateTime.now().setZone("Asia/Manila").plus({ days: 1 });
    const nextRestockingDate = tomorrow.toFormat("MM/dd/yy");
    console.log(`Next restocking date: ${nextRestockingDate}`);

    // Format recommended restocking time (subtract 8 hours)
    let recommendedRestockingTime = "-";
    if (restockingTime) {
      const originalRestockTime = DateTime.fromJSDate(restockingTime).setZone("Asia/Manila");
      const adjustedTime = originalRestockTime.minus({ hours: 8 });
      recommendedRestockingTime = adjustedTime.toFormat("h:mm a");
      console.log(`Original restocking time: ${originalRestockTime.toFormat("h:mm a")}`);
      console.log(`Adjusted restocking time (minus 8 hours): ${recommendedRestockingTime}`);
    } else {
      console.log("No restocking time available from calendar events");
      recommendedRestockingTime = "-";
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

  // Helper function to aggregate remaining volumes by hour (6 AM to 7 PM) with an 8-hour adjustment
  const aggregateHourlyData = (usageData) => {
    const hourlyData = {};
    const resources = ["CONT1", "CONT2", "CONT3", "CONT4"];
    const hours = Array.from({ length: 14 }, (_, i) => 6 + i); // 6 AM to 7 PM (06:00 to 19:00)

    // Initialize hourly data
    hours.forEach((hour) => {
      const hourKey = `${hour.toString().padStart(2, "0")}:00`;
      hourlyData[hourKey] = {};
      resources.forEach((resource) => {
        hourlyData[hourKey][resource] = [];
      });
    });

    // Process all remaining_volumes entries with an 8-hour adjustment
    usageData.forEach((entry, entryIndex) => {
      if (entry.remaining_volumes && Array.isArray(entry.remaining_volumes)) {
        entry.remaining_volumes.forEach((volumeEntry, volIndex) => {
          if (volumeEntry.timestamp && volumeEntry.volumes) {
            // Validate and parse timestamp
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
                volumeEntry.timestamp,
                "Parsed as:",
                timestamp.invalidReason
              );
              return;
            }

            // Subtract 8 hours from the timestamp for graph purposes
            const adjustedTimestamp = timestamp.minus({ hours: 8 });
            const hour = adjustedTimestamp.hour;
            console.log(
              `Entry ${entryIndex}, Volume ${volIndex}: Original Timestamp=${volumeEntry.timestamp}, Original Time in Asia/Manila=${timestamp.toFormat("yyyy-MM-dd HH:mm:ss")}, Adjusted Time (minus 8 hours)=${adjustedTimestamp.toFormat("yyyy-MM-dd HH:mm:ss")}, Adjusted Hour=${hour}`
            );

            if (hour >= 6 && hour <= 19) { // Filter 6 AM to 7 PM based on adjusted time
              const hourKey = adjustedTimestamp.toFormat("HH:00");
              resources.forEach((resource) => {
                if (typeof volumeEntry.volumes[resource] === "number") {
                  if (!hourlyData[hourKey]) {
                    console.warn(`Hour key ${hourKey} not initialized; initializing now.`);
                    hourlyData[hourKey] = {};
                    resources.forEach((res) => {
                      hourlyData[hourKey][res] = [];
                    });
                  }
                  hourlyData[hourKey][resource].push(volumeEntry.volumes[resource]);
                  console.log(
                    `Added ${volumeEntry.volumes[resource]} to ${resource} at ${hourKey} (adjusted time)`
                  );
                } else {
                  console.warn(
                    `Invalid volume for ${resource} in entry ${entryIndex}, volume ${volIndex}:`,
                    volumeEntry.volumes[resource]
                  );
                }
              });
            } else {
              console.log(
                `Entry ${entryIndex}, Volume ${volIndex} excluded: Adjusted hour ${hour} is outside 6 AM to 7 PM range`
              );
            }
          } else {
            console.warn(
              `Missing timestamp or volumes in entry ${entryIndex}, volume ${volIndex}:`,
              volumeEntry
            );
          }
        });
      }
    });

    // Compute average volume per hour for each resource
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

    console.log("Aggregated hourly data (adjusted time):", JSON.stringify({ labels, datasets }, null, 2));
    return { labels, datasets };
  };

  // Helper function to create line graph as base64 image
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
            x: {
              title: { display: true, text: "Hour of Day (Adjusted)" },
            },
            y: {
              title: { display: true, text: "Volume (ml)" },
              beginAtZero: true,
            },
          },
        },
      });

      // Wait for chart to render
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

  // Handler for generating graph and PDF
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

      // Fetch dispenser usage data for the selected date
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

      // Aggregate data for line graph with adjusted timestamps
      const chartData = aggregateHourlyData(usageData);

      // Check if chart data is empty
      if (chartData.datasets.every(dataset => dataset.data.every(value => value === 0))) {
        Swal.fire({
          icon: "warning",
          title: "No Data",
          text: "No remaining volumes data available between 6 AM and 7 PM for the selected date.",
          confirmButtonColor: "#23897D",
        });
        return;
      }

      // Generate line graph image
      const chartImage = await createLineGraphImage(chartData);

      // Initialize jsPDF in landscape orientation
      const doc = new jsPDF({ orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
      const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
      const margin = 15;
      let y = margin;

      // Add watermark
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

      // Add logo
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

      // Title
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

      // Generated on
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

      // Add chart image
      const chartWidth = pageWidth - 2 * margin;
      const chartHeight = 100; // Adjust as needed
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

      // Save and trigger print dialog
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

  // Handler for printing
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

    // Initialize jsPDF in landscape orientation
    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let y = margin;

    // Watermark function
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

    // Load logo
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

    // Title
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

    // Generated on
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

    // Total Resources
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    const totalResources = inventoryData.length;
    doc.text(`Total Resources: ${totalResources}`, margin, y);
    y += 10;

    // Table Styling
    const columnWidths = [60, 30, 35, 35, 30, 35, 35, 30];
    const totalTableWidth = columnWidths.reduce((a, b) => a + b, 0);
    const tableX = (pageWidth - totalTableWidth) / 2;
    const rowHeight = 8;
    const headerY = y;

    // Table Header
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
      "Restock",
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

    // Table Rows
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

      // Add new page if needed
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
      console.error("Failed to open print window.");
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

  const handlePageChange = useCallback((page) => {
    setCurrentPage(page);
  }, []);

  const handlePrevPage = useCallback(() => {
    setCurrentPage((prev) => (prev > 1 ? prev - 1 : prev));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) => (prev < totalPages ? prev + 1 : prev));
  }, [totalPages]);

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

  const table = useReactTable({
    data: currentItems,
    columns: inventoryColumns,
    getCoreRowModel: getCoreRowModel(),
    pageCount: totalPages,
    state: {
      pagination: {
        pageIndex: currentPage - 1,
        pageSize: itemsPerPage,
      },
    },
  });

  // Log table rows for debugging
  useEffect(() => {
    console.log(`Table rows rendered: ${table.getRowModel().rows.length}`, table.getRowModel().rows.map(row => row.original));
  }, [table.getRowModel().rows]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex flex-row gap-3 p-6 overflow-hidden bg-white shadow-md rounded-lg">
        {/* Left Content Area */}
        <div className="flex-[3] flex flex-col gap-3 min-w-0">
          {/* Charts Grid */}
          <div className="h-[432px] shrink-0">
            <div className="grid grid-cols-2 gap-3 h-full">
              <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 flex flex-col">
                <div className="flex-1 min-h-0">
                  <ResourcesUsageChart
                    chartType={chartType}
                    setChartType={setChartType}
                  />
                </div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 flex flex-col">
                <div className="flex-1 min-h-0">
                  <TrendsOverTimeChart
                    trendsChartType={trendsChartType}
                    setTrendsChartType={setTrendsChartType}
                  />
                </div>
              </div>
            </div>
          </div>
          {/* Inventory Table Section */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Inventory Table Header */}
            <div className="flex items-center justify-between py-4">
              <h2 className="font-bold text-2xl">Inventory</h2>
              <div className="flex items-center justify-between relative w-full sm:w-[200px]">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleMonthChange(1)}
                >
                  <ChevronUp className="h-5 w-5 text-gray-500" />
                </Button>
                <div className="relative inline-block">
                  <DatePicker
                    selected={selectedDate}
                    onChange={(date) => {
                      console.log(`Datepicker selected: ${date.toISOString().split("T")[0]}`);
                      setSelectedDate(date);
                    }}
                    dateFormat="MMMM yyyy"
                    showMonthYearPicker
                    showPopperArrow={false}
                    popperContainer={({ children }) => (
                      <div className="absolute z-[9999] mt-2">{children}</div>
                    )}
                    customInput={
                      <span className="text-gray-700 font-medium cursor-pointer">
                        {selectedDate.toLocaleString("default", {
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    }
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleMonthChange(-1)}
                >
                  <ChevronDown className="h-5 w-5 text-gray-500" />
                </Button>
              </div>
              <div className="flex items-center gap-4">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleGenerate}
                  className="flex items-center gap-2 bg-Icpetgreen hover:bg-Icpetgreen/90"
                >
                  <PencilIcon className="w-4 h-4" />
                  Generate Graph
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  className="flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {/* Table Container */}
            <div className="h-[270px] overflow-x-auto overflow-y-hidden border border-gray-200 rounded-lg shadow-md relative">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <LoadingSpinner />
                </div>
              ) : (
                <div className="flex flex-col min-w-full h-full">
                  {/* Table Header */}
                  <div className="border-b">
                    <Table className="min-w-full">
                      <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                          <TableRow key={headerGroup.id} className="bg-gray-50">
                            {headerGroup.headers.map((header) => (
                              <TableHead
                                key={header.id}
                                style={{
                                  width: `${header.column.columnDef.size * 100}%`,
                                }}
                                className="h-8 px-2 py-2 sm:h-10 sm:px-3 sm:py-3 text-left align-middle font-medium text-gray-900 text-xs sm:text-sm"
                              >
                                {header.isPlaceholder
                                  ? null
                                  : flexRender(
                                      header.column.columnDef.header,
                                      header.getContext()
                                    )}
                              </TableHead>
                            ))}
                          </TableRow>
                        ))}
                      </TableHeader>
                    </Table>
                  </div>
                  {/* Inventory Table Body */}
                  <div className="flex-1 overflow-x-auto overflow-y-hidden">
                    <Table className="min-w-full">
                      <TableBody>
                        {table.getRowModel().rows?.length ? (
                          table.getRowModel().rows.map((row) => (
                            <TableRow key={row.id} className="hover:bg-gray-50">
                              {row.getVisibleCells().map((cell) => (
                                <TableCell
                                  key={cell.id}
                                  style={{
                                    width: `${cell.column.columnDef.size * 100}%`,
                                  }}
                                  className="px-2 py-2 sm:px-3 sm:py-3 text-xs sm:text-sm"
                                >
                                  {flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext()
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={inventoryColumns.length}
                              className="h-24 text-center"
                            >
                              {error ? `Error: ${error}` : "No results."}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Pagination */}
                  <div className="border-t border-gray-200 bg-white p-2">
                    {totalPages > 1 && (
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious
                              onClick={handlePrevPage}
                              className={cn(
                                "cursor-pointer select-none",
                                currentPage === 1 && "pointer-events-none opacity-50"
                              )}
                            />
                          </PaginationItem>
                          {pageNumbers.map((page) => (
                            <PaginationItem key={page}>
                              <PaginationLink
                                onClick={() => handlePageChange(page)}
                                isActive={currentPage === page}
                                className={cn(
                                  "cursor-pointer select-none",
                                  currentPage === page &&
                                    "bg-Icpetgreen text-white hover:bg-Icpetgreen/90"
                                )}
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          ))}
                          <PaginationItem>
                            <PaginationNext
                              onClick={handleNextPage}
                              className={cn(
                                "cursor-pointer select-none",
                                currentPage === totalPages &&
                                  "pointer-events-none opacity-50"
                              )}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Right Sidebar */}
        <div className="max-w-[360px] flex-[1] flex flex-col gap-6">
          <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 shrink-0">
              <h2 className="font-bold text-2xl">Reminder</h2>
              <button className="text-sm text-green-600 bg-green-100 px-3 py-1.5 rounded-lg hover:bg-green-200">
                Janitors Usage
              </button>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto min-h-0">
              <div className="space-y-4 pr-2">
                {loading ? (
                  <LoadingSpinner />
                ) : error ? (
                  <div className="text-center text-red-500">Error: {error}</div>
                ) : remindersData.length > 0 ? (
                  remindersData.map((reminderSection, idx) => (
                    <ReminderCard
                      key={idx}
                      date={reminderSection.date}
                      items={reminderSection.items}
                    />
                  ))
                ) : (
                  <div className="text-center text-gray-500">No Reminders Available</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}