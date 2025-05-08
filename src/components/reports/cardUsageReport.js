import React, { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { jsPDF } from "jspdf";
import Swal from "sweetalert2"; // Import SweetAlert2

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

export default function CardUsageReport() {
  const [usageData, setUsageData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const fetchUsageData = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        console.error("No token found in localStorage");
        navigate("/login");
        return;
      }

      const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
      const response = await fetch(`${API_BASE_URL}/api/occupancy/summary`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log("Response Status:", response.status);
      console.log("Content-Type:", response.headers.get("content-type"));

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response:", text);
        throw new Error("Server returned non-JSON response");
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          console.error("Authentication failed, redirecting to login");
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Fetched data:", data);

      // Validate data consistency
      if (data.thisWeek < data.today + data.yesterday) {
        console.warn("This Week count is lower than Today + Yesterday:", data);
      }
      if (data.thisMonth < data.thisWeek) {
        console.warn("This Month count is lower than This Week:", data);
      }
      if (data.thisYear < data.thisMonth) {
        console.warn("This Year count is lower than This Month:", data);
      }

      const formattedData = [
        { title: "Today", count: data.today || 0, isLive: true },
        { title: "Today", count: data.today || 0, isLive: false },
        { title: "Yesterday", count: data.yesterday || 0, isLive: false },
        { title: "This Week", count: data.thisWeek || 0, isLive: false },
        { title: "This Month", count: data.thisMonth || 0, isLive: false },
        { title: "This Year", count: data.thisYear || 0, isLive: false },
      ];
      setUsageData(formattedData);
      setLoading(false);
    } catch (err) {
      console.error("Fetch Error:", err.message);
      setError(err.message);
      setLoading(false);
      const fallbackData = [
        { title: "Today", count: 0, isLive: true },
        { title: "Today", count: 0, isLive: false },
        { title: "Yesterday", count: 0, isLive: false },
        { title: "This Week", count: 0, isLive: false },
        { title: "This Month", count: 0, isLive: false },
        { title: "This Year", count: 0, isLive: false },
      ];
      setUsageData(fallbackData);
    }
  };

  const fetchDetailedReport = async (period) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return [];
      }

      const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
      const response = await fetch(`${API_BASE_URL}/api/occupancy/details/${period}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem("token");
          navigate("/login");
          return [];
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error(`Error fetching ${period} details:`, err.message);
      return [];
    }
  };

  const generatePDF = async (period, entries) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let y = margin;

    // Watermark function
    const addWatermark = async () => {
      console.log("Adding watermark...");
      const watermarkUrl = "/images/watermark.png"; // Path to pre-rotated watermark image
      const watermarkBase64 = await loadImageAsBase64(watermarkUrl);
      if (watermarkBase64) {
        const watermarkWidth = 200; // Adjust based on image size
        const watermarkHeight = 200; // Adjust based on image size
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
    doc.text(`${period} Occupancy Report`, margin, y);
    const titleWidth = doc.getTextWidth(`${period} Occupancy Report`);
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

    // Total Visits
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    const totalVisits = entries.length;
    doc.text(`Total Visits: ${totalVisits}`, margin, y);
    y += 10;

    // Table Styling
    const columnWidths = [40, 30, 25, 25, 30];
    const totalTableWidth = columnWidths.reduce((a, b) => a + b, 0);
    const tableX = (pageWidth - totalTableWidth) / 2; // Center table
    const rowHeight = 8;
    const headerY = y;

    // Table Header
    doc.setFillColor(35, 137, 125); // #23897D
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.3);
    doc.rect(tableX, headerY, totalTableWidth, rowHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255); // White text for headers
    const headers = ["Date", "Visitor ID", "Start Time", "End Time", "Duration (min)"];
    let currentX = tableX + 2;
    headers.forEach((header, index) => {
      doc.text(header, currentX, headerY + 5.5);
      currentX += columnWidths[index];
    });
    y += rowHeight;

    // Table Rows
    for (const [index, entry] of entries.entries()) {
      if (index % 2 === 0) {
        doc.setFillColor(245, 245, 245);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      doc.rect(tableX, y, totalTableWidth, rowHeight, "F");

      const date = entry.start_time
        ? new Date(entry.start_time).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            timeZone: "Asia/Manila",
          })
        : "N/A";
      const visitorId = entry.visitor_id ? String(entry.visitor_id) : "N/A";
      const startTime = entry.start_time
        ? new Date(entry.start_time).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
            timeZone: "Asia/Manila",
          })
        : "N/A";
      const endTime = entry.end_time
        ? new Date(entry.end_time).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
            timeZone: "Asia/Manila",
          })
        : "N/A";
      const duration = entry.duration != null ? String(Math.round(entry.duration)) : "N/A";

      const rowData = [date, visitorId, startTime, endTime, duration];
      currentX = tableX + 2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0); // Black text for row data
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

      // Add new page if needed
      if (y > pageHeight - margin - rowHeight) {
        // Add watermark to the current page before adding a new one
        await addWatermark();
        doc.addPage();
        y = margin;
        // Redraw table header
        doc.setFillColor(35, 137, 125); // #23897D
        doc.rect(tableX, y, totalTableWidth, rowHeight, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255); // White text for headers
        currentX = tableX + 2;
        headers.forEach((header, index) => {
          doc.text(header, currentX, y + 5.5);
          currentX += columnWidths[index];
        });
        y += rowHeight;
      }
    }

    // Add watermark to the final page after table rendering
    await addWatermark();

    // Save and trigger print dialog
    const pdfOutput = doc.output("blob");
    const pdfUrl = URL.createObjectURL(pdfOutput);
    const printWindow = window.open(pdfUrl);
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  const handleViewReport = async (period) => {
    // Check if period is invalid (empty, undefined, or null)
    if (!period || period.trim() === "") {
      Swal.fire({
        icon: "error",
        title: "Invalid Period",
        text: "Please select a valid time period to view the report.",
        confirmButtonColor: "#23897D",
      });
      return;
    }

    const normalizedPeriod = period.toLowerCase().replace(" ", "");
    const entries = await fetchDetailedReport(normalizedPeriod);
    if (entries.length > 0) {
      await generatePDF(period, entries);
    } else {
      console.warn(`No data available for ${period}`);
      Swal.fire({
        icon: "warning",
        title: "No Data",
        text: `No data available for ${period}.`,
        confirmButtonColor: "#23897D",
      });
    }
  };

  useEffect(() => {
    fetchUsageData();
    const intervalId = setInterval(() => {
      if (!loading && !error) {
        fetchUsageData();
      }
    }, 10000);
    return () => clearInterval(intervalId);
  }, [navigate, loading, error]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return <div className="text-center p-4 text-red-600">Error: {error}</div>;
  }

  return (
    <div className="h-full overflow-hidden">
      <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-2 gap-2 p-2 h-full overflow-y-auto xl:overflow-none 2xl:overflow-none">
        {usageData.map((card, index) => (
          <div
            key={index}
            className="bg-white shadow-sm rounded-lg p-2 flex flex-col justify-between border border-gray-200 2xl:min-h-full min-h-[130px]"
          >
            <div className="flex flex-col">
              <div className="flex justify-between items-start">
                <div className="text-xs text-gray-500">
                  {card.isLive ? "LIVE!" : "Total"}
                </div>
                {card.isLive && (
                  <div className="text-red-600 font-semibold text-[10px] bg-red-50 px-1.5 py-0.5 rounded">
                    LIVE!
                  </div>
                )}
              </div>
              <div className="text-sm font-semibold text-gray-900">
                {card.title}
              </div>
              <div className="text-base font-bold text-gray-900">
                {card.count} People
              </div>
            </div>
            <button
              onClick={() => handleViewReport(card.title)}
              className="flex items-center justify-between w-full bg-[#23897D] text-white py-1.5 px-3 rounded text-xs font-medium hover:bg-opacity-90 transition-colors"
            >
              <span>View Report</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}