import React, { useState, useEffect, useRef, useMemo } from 'react';
import { UsageMonitoringChart } from '../../../components/charts/mainCharts';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Printer, ChevronDown, ChevronUp } from 'heroicons-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import CardUsageReport from '../../../components/reports/cardUsageReport';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { inventoryColumns } from '../../../components/tables/usage-monitor/inventory-columns';
import { janitorColumns } from '../../../components/tables/usage-monitor/janitor-columns';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { axiosInstance } from '../../../components/controller/authController';
import { DateTime } from 'luxon';
import { calculateHourlyAverages } from '../../../components/utils/odorCalculations';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import _ from 'lodash';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

// Define backend URL
const backendUrl = process.env.REACT_APP_BACKEND_URL || 'https://smart-cubicle-backend.onrender.com';

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
    console.error('Error loading image:', error);
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
        if (period === 'PM' && hours < 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
      }
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }
  return null;
};

export default function UsageMonitor() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [fetchDate, setFetchDate] = useState(selectedDate);
  const [janitorData, setJanitorData] = useState([]);
  const [inventoryData, setInventoryData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sensorDataLoading, setSensorDataLoading] = useState(false);
  const [janitorDataLoading, setJanitorDataLoading] = useState(false);
  const [error, setError] = useState(null);
  const tableRef = useRef(null);
  const chartRef = useRef(null);

  // Debounce date changes to prevent rapid API calls
  const debouncedSetFetchDate = useMemo(
    () => _.debounce((date) => setFetchDate(date), 500),
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

  // Fetch data based on fetchDate
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setSensorDataLoading(true);
      setJanitorDataLoading(true);
      setError(null);
      setInventoryData([]); // Clear inventory data before fetching

      try {
        // Fetch Janitors Schedule data
        console.log(`Fetching janitors from ${backendUrl}/janitors`);
        const janitorResponse = await fetch(`${backendUrl}/janitors?ts=${Date.now()}`);
        if (!janitorResponse.ok) {
          throw new Error(`Failed to fetch janitors: ${janitorResponse.status} ${janitorResponse.statusText}`);
        }
        const janitorDataRaw = await janitorResponse.json();
        console.log('Janitor API Response:', janitorDataRaw);

        const allSchedules = janitorDataRaw.flatMap((janitor) =>
          (janitor.schedule || []).map((entry) => ({
            janitorId: janitor._id,
            name: janitor.basicDetails?.name || 'N/A',
            image: janitor.basicDetails?.image || '',
            date: entry.date || 'N/A',
            cleaningHour: entry.cleaningHour || 'N/A',
            status: entry.status || 'Pending',
            shift: entry.shift || null,
          }))
        );

        const sortedSchedules = allSchedules.sort((a, b) => {
          const parseDate = (dateStr) => {
            if (!dateStr || dateStr === 'N/A') return new Date(0);
            let date;
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
              const [month, day, year] = dateStr.split('/').map(Number);
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
            if (!normalized || time === 'N/A') return 0;
            const [hours, minutes] = normalized.split(':').map(Number);
            return hours * 60 + minutes;
          };

          const timeA = parseCleaningHour(a.cleaningHour);
          const timeB = parseCleaningHour(b.cleaningHour);
          return timeB - timeA;
        });

        setJanitorData(sortedSchedules);

        // Fetch Sensor Data
        const formattedDate = DateTime.fromJSDate(fetchDate)
          .setZone('Asia/Manila')
          .toISODate(); // Produces YYYY-MM-DD, e.g., 2025-05-08

        if (!formattedDate || !/^\d{4}-\d{2}-\d{2}$/.test(formattedDate)) {
          throw new Error(`Invalid date format generated: ${formattedDate}`);
        }

        console.log(`Fetching sensor data for date: ${formattedDate}`);

        const endpoints = [
          { url: `/api/occupancy/${formattedDate}`, name: 'Occupancy', required: true },
          { url: `/api/occupancy/predictions/${formattedDate}`, name: 'Predictions', required: true },
          { url: `/api/odor-module/raw-data/${formattedDate}`, name: 'Odor Raw Data', required: false },
        ];

        let noDataError = false; // Flag to track "No DATA found" errors

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
              const errorMessage = error.response?.data?.message || error.response?.statusText || error.message;
              if (required && errorMessage.includes('No DATA found')) {
                noDataError = true; // Mark as no data error
                return { name, data: null, error: null }; // Suppress error for no data
              }
              if (required) {
                throw new Error(`Failed to fetch ${name}: ${errorMessage}`);
              }
              return { name, data: null, error: errorDetails };
            }
          })
        );

        if (noDataError) {
          setInventoryData([]); // Clear table for no data
          return; // Exit early, no error message at top
        }

        const responseMap = responses.reduce((acc, { name, data, error }) => {
          acc[name] = { data, error };
          return acc;
        }, {});

        const occupancyData = Array.isArray(responseMap['Occupancy'].data)
          ? responseMap['Occupancy'].data
          : [];
        const predictionHours = responseMap['Predictions'].data?.hours || [];
        const odorRawDocuments = responseMap['Odor Raw Data'].data?.rawDocuments || [];

        console.log('Occupancy data:', occupancyData);
        console.log('Prediction hours:', predictionHours);
        console.log('Odor raw documents:', odorRawDocuments);

        const odorAverages = calculateHourlyAverages(odorRawDocuments);
        console.log('Processed odor averages (Fahrenheit):', odorAverages);

        const allHours = Array.from({ length: 14 }, (_, i) => {
          const hour = 6 + i;
          return DateTime.fromObject(
            {
              year: DateTime.fromJSDate(fetchDate).year,
              month: DateTime.fromJSDate(fetchDate).month,
              day: DateTime.fromJSDate(fetchDate).day,
              hour,
            },
            { zone: 'Asia/Manila' }
          ).toJSDate();
        });

        const mergedData = allHours.map((

hour, index) => {
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

          let status = 'Normal';
          let actionRequired = 'No Action Required';
          let color = 'text-green-600';

          if (count < 9) {
            status = 'Normal';
            actionRequired = 'No Action Required';
            color = 'text-green-600';
          } else if (count >= 10 && isPeak) {
            status = 'High Capacity';
            actionRequired = 'Clean Restroom';
            color = 'text-red-600';
          } else if (
            (nextHourCount &&
              nextHourCount >= 10 &&
              predictionHours.includes(6 + index + 1)) ||
            (prevHourCount &&
              prevHourCount >= 10 &&
              predictionHours.includes(6 + index - 1))
          ) {
            status = 'Moderate';
            actionRequired = 'Monitor Restroom';
            color = 'text-yellow-600';
          }

          const odorData =
            odorAverages.find(
              (o) =>
                o.timeStamp ===
                DateTime.fromJSDate(hour).setZone('Asia/Manila').toFormat('h:mm a')
            ) || {
              odor: { value: 0, status: 'Unknown', color: 'text-gray-600' },
              temperature: { value: 0, status: 'Unknown', color: 'text-gray-600' },
              actionRequired: 'None',
            };

          const combinedActionRequired =
            actionRequired !== 'No Action Required'
              ? actionRequired
              : odorData.actionRequired !== 'None'
              ? odorData.actionRequired
              : 'No Action Required';

          return {
            timeStamp: DateTime.fromJSDate(hour)
              .setZone('Asia/Manila')
              .toFormat('h:mm a'),
            capacity: {
              value: count,
              status,
              color,
            },
            odor: odorData.odor,
            temperature: odorData.temperature,
            actionRequired: combinedActionRequired,
            hour: 6 + index,
          };
        });

        const sortedData = mergedData.sort((a, b) => b.hour - a.hour);
        setInventoryData(sortedData);
      } catch (error) {
        console.error('Error fetching data:', error.message);
        setInventoryData([]); // Clear table on error
        setError(
          error.message.includes('Failed to fetch') && !error.message.includes('No DATA found')
            ? error.message
            : 'Failed to fetch data. Please check your network connection or login status and try again.'
        );
      } finally {
        setLoading(false);
        setSensorDataLoading(false);
        setJanitorDataLoading(false);
      }
    };
    fetchData();
  }, [fetchDate]);

  // Memoize valid data to prevent re-computation
  const validData = useMemo(() => {
    return inventoryData.filter((item) => {
      return (
        item.capacity.value > 0 ||
        item.odor.value > 0 ||
        item.temperature.value > 0 ||
        item.odor.status !== 'Unknown' ||
        item.temperature.status !== 'Unknown'
      );
    });
  }, [inventoryData]);

  // PDF generation functions (unchanged)
  const handlePrintInventoryTable = async () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      let y = margin;

      const addWatermark = async () => {
        console.log('Adding watermark...');
        const watermarkUrl = '/images/watermark.png';
        const watermarkBase64 = await loadImageAsBase64(watermarkUrl);
        if (watermarkBase64) {
          const watermarkWidth = 200;
          const watermarkHeight = 200;
          const centerX = (pageWidth - watermarkWidth) / 2;
          const centerY = (pageHeight - watermarkHeight) / 2;
          try {
            doc.addImage(watermarkBase64, 'PNG', centerX, centerY, watermarkWidth, watermarkHeight);
            console.log('Watermark image rendered at:', { x: centerX, y: centerY });
          } catch (error) {
            console.error('Error adding watermark image to PDF:', error);
          }
        } else {
          console.warn('Watermark image could not be loaded; skipping watermark.');
        }
      };

      const logoUrl = '/images/ICPET.png';
      const logoBase64 = await loadImageAsBase64(logoUrl);
      if (logoBase64) {
        const logoWidth = 25;
        const logoHeight = 25;
        const logoX = pageWidth - margin - logoWidth - 5;
        const logoY = margin - 5;
        try {
          doc.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);
        } catch (error) {
          console.error('Error adding logo to PDF:', error);
        }
      } else {
        console.warn('Logo image could not be loaded; skipping logo.');
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(0, 51, 102);
      doc.text('Sensor Data Table Report', margin, y);
      const titleWidth = doc.getTextWidth('Sensor Data Table Report');
      doc.setDrawColor(0, 51, 102);
      doc.setLineWidth(0.5);
      doc.line(margin, y + 2, margin + titleWidth, y + 2);
      y += 12;

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      const today = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
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
      doc.rect(tableX, headerY, totalTableWidth, rowHeight, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      const headers = ['Time Stamp', 'Occupancy', 'Odor', 'Temperature (°F)', 'Action Required'];
      let currentX = tableX + 2;
      headers.forEach((header, index) => {
        doc.text(header, currentX, headerY + 5.5);
        currentX += columnWidths[index];
      });
      y += rowHeight;

      for (const [index, entry] of validData.entries()) {
        if (index % 2 === 0) {
          doc.setFillColor(245, 245, 245);
        } else {
          doc.setFillColor(255, 255, 255);
        }
        doc.rect(tableX, y, totalTableWidth, rowHeight, 'F');

        const timeStamp = entry.timeStamp || 'N/A';
        const occupancy = `${entry.capacity.value} (${entry.capacity.status})`;
        const odor = `${entry.odor.value} (${entry.odor.status})`;
        const temperature = `${entry.temperature.value} (${entry.temperature.status})`;
        const actionRequired = entry.actionRequired || 'N/A';

        const rowData = [timeStamp, occupancy, odor, temperature, actionRequired];
        currentX = tableX + 2;
        doc.setFont('helvetica', 'normal');
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
          doc.rect(tableX, y, totalTableWidth, rowHeight, 'F');
          doc.setFont('helvetica', 'bold');
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
      const pdfOutput = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfOutput);
      const printWindow = window.open(pdfUrl);
      printWindow.onload = () => {
        printWindow.print();
      };
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  const handlePrintChart = async () => {
    if (!chartRef.current) {
      console.error('Chart reference is not available');
      alert('Chart is not available. Please try again.');
      return;
    }

    try {
      const canvas = await html2canvas(chartRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      let y = margin;

      const addWatermark = async () => {
        console.log('Adding watermark...');
        const watermarkUrl = '/images/watermark.png';
        const watermarkBase64 = await loadImageAsBase64(watermarkUrl);
        if (watermarkBase64) {
          const watermarkWidth = 200;
          const watermarkHeight = 200;
          const centerX = (pageWidth - watermarkWidth) / 2;
          const centerY = (pageHeight - watermarkHeight) / 2;
          try {
            doc.addImage(watermarkBase64, 'PNG', centerX, centerY, watermarkWidth, watermarkHeight);
            console.log('Watermark image rendered at:', { x: centerX, y: centerY });
          } catch (error) {
            console.error('Error adding watermark image to PDF:', error);
          }
        } else {
          console.warn('Watermark image could not be loaded; skipping watermark.');
        }
      };

      const logoUrl = '/images/ICPET.png';
      const logoBase64 = await loadImageAsBase64(logoUrl);
      if (logoBase64) {
        const logoWidth = 25;
        const logoHeight = 25;
        const logoX = pageWidth - margin - logoWidth - 5;
        const logoY = margin - 5;
        try {
          doc.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);
        } catch (error) {
          console.error('Error adding logo to PDF:', error);
        }
      } else {
        console.warn('Logo image could not be loaded; skipping logo.');
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(0, 51, 102);
      doc.text('Usage Monitoring Chart Report', margin, y);
      const titleWidth = doc.getTextWidth('Usage Monitoring Chart Report');
      doc.setDrawColor(0, 51, 102);
      doc.setLineWidth(0.5);
      doc.line(margin, y + 2, margin + titleWidth, y + 2);
      y += 12;

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      const today = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
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

      doc.addImage(imgData, 'PNG', imgX, y, scaledWidth, scaledHeight);
      await addWatermark();

      const pdfOutput = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfOutput);
      const printWindow = window.open(pdfUrl);
      printWindow.onload = () => {
        printWindow.print();
      };
    } catch (error) {
      console.error('Error generating chart PDF:', error);
      alert('Failed to generate chart PDF. Please try again.');
    }
  };

  const inventoryTable = useReactTable({
    data: validData,
    columns: inventoryColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const janitorTable = useReactTable({
    data: janitorData,
    columns: janitorColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Card className="flex flex-col h-full bg-white shadow-md p-1 rounded-lg overflow-hidden">
      <CardContent className="flex-1 flex flex-col min-h-0 p-2 sm:p-4 gap-2 sm:gap-4">
        {error && (
          <div className="text-red-600 text-center p-2 bg-red-50 rounded">
            {error}
          </div>
        )}
        <div className="flex flex-col lg:flex-row gap-2 sm:gap-4" style={{ height: '55%' }}>
          <Card className="w-full lg:w-2/3 flex flex-col h-full overflow-hidden">
            <CardContent className="flex-1 p-4 flex flex-col min-h-0">
              <div className="relative flex-1 w-full min-h-0" ref={chartRef}>
                <UsageMonitoringChart showHeading={false} />
              </div>
            </CardContent>
          </Card>
          <Card className="w-full lg:w-1/3 flex flex-col h-full">
            <CardHeader className="border-b shrink-0 p-4 space-y-0">
              <CardTitle className="text-xl font-semibold">Usage Report</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 flex flex-col min-h-0">
              <div className="flex-1 overflow-auto">
                <CardUsageReport />
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col lg:flex-row gap-2 sm:gap-4 flex-1 min-h-0">
          <Card className="w-full lg:w-2/3 flex flex-col h-full">
            <CardHeader className="border-b shrink-0 p-2 sm:p-4 space-y-0 flex flex-row items-center justify-between">
              <div className="flex-0">
                <CardTitle className="text-lg sm:text-xl font-semibold">Sensor Data</CardTitle>
              </div>
              <div className="flex-1 flex justify-center">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 sm:h-10 sm:w-10"
                    onClick={() => handleDayChange(-1)}
                    disabled={loading}
                    aria-label="Previous day"
                  >
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  </Button>
                  <DatePicker
                    selected={selectedDate}
                    onChange={handleDateChange}
                    dateFormat="MM/dd/yyyy"
                    showPopperArrow={false}
                    popperPlacement="bottom"
                    popperModifiers={[
                      {
                        name: 'offset',
                        options: {
                          offset: [0, 8],
                        },
                      },
                      {
                        name: 'preventOverflow',
                        options: {
                          rootBoundary: 'viewport',
                          tether: false,
                          altAxis: true,
                        },
                      },
                      {
                        name: 'flip',
                        options: {
                          fallbackPlacements: ['bottom'],
                        },
                      },
                      {
                        name: 'computeStyles',
                        options: {
                          adaptive: true,
                          gpuAcceleration: false,
                        },
                      },
                    ]}
                    customInput={
                      <span className="text-gray-700 font-medium cursor-pointer rounded-md px-2 py-1 hover:bg-gray-100">
                        {selectedDate.toLocaleDateString('en-US', {
                          month: 'short',
                          day: '2-digit',
                          year: 'numeric',
                        })}
                      </span>
                    }
                    wrapperClassName="react-datepicker-center"
                    disabled={loading}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 sm:h-10 sm:w-10"
                    onClick={() => handleDayChange(1)}
                    disabled={loading}
                    aria-label="Next day"
                  >
                    <ChevronUp className="h-5 w-5 text-gray-500" />
                  </Button>
                </div>
              </div>
              <div className="flex-0 flex items-center gap-2">
                <Button
                  variant="default"
                  className="bg-Icpetgreen hover:bg-opacity-90 text-sm sm:text-base"
                  onClick={handlePrintChart}
                  disabled={loading || validData.length === 0}
                  aria-label="Generate chart PDF"
                >
                  Generate Graph
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 sm:h-10 sm:w-10"
                  onClick={handlePrintInventoryTable}
                  disabled={loading || validData.length === 0}
                  aria-label="Print sensor data table"
                >
                  <Printer className="h-4 w-4 sm:h-5 sm:w-5 text-Icpetgreen" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 flex flex-col min-h-0">
              <div className="border-b shrink-0">
                <Table>
                  <TableHeader>
                    {inventoryTable.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id} className="bg-gray-50">
                        {headerGroup.headers.map((header) => (
                          <TableHead
                            key={header.id}
                            style={{ width: `${header.column.columnDef.size * 100}%` }}
                            className="h-8 px-2 py-2 sm:h-10 sm:px-3 sm:py-3 text-left align-middle font-medium text-gray-900 text-xs sm:text-sm"
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                </Table>
              </div>
              <div className="flex-1 overflow-auto" ref={tableRef}>
                <Table>
                  <TableBody>
                    {sensorDataLoading ? (
                      <TableRow>
                        <TableCell colSpan={inventoryColumns.length} className="h-24">
                          <div className="flex justify-center items-center h-full">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : validData.length > 0 ? (
                      inventoryTable.getRowModel().rows.map((row) => (
                        <TableRow key={row.id} className="hover:bg-gray-50">
                          {row.getVisibleCells().map((cell) => (
                            <TableCell
                              key={cell.id}
                              style={{ width: `${cell.column.columnDef.size * 100}%` }}
                              className="px-2 py-2 sm:px-3 sm:py-3 text-xs sm:text-sm"
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={inventoryColumns.length} className="h-24 text-center text-gray-500">
                          No data for {selectedDate.toLocaleDateString('en-US', {
                            month: 'short',
                            day: '2-digit',
                            year: 'numeric',
                          })}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <Card className="w-full lg:w-1/3 flex flex-col h-full">
            <CardHeader className="border-b shrink-0 p-4 space-y-0 flex flex-row items-center justify-between">
              <CardTitle className="text-xl font-semibold">Janitors Schedule</CardTitle>
              <div className="flex items-center gap-4">
                <Button
                  variant="default"
                  className="bg-Icpetgreen hover:bg-opacity-90"
                  disabled={loading}
                  aria-label="Generate janitor schedule"
                >
                  Generate Schedule
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  disabled={loading}
                  aria-label="Print janitor schedule"
                >
                  <Printer className="h-5 w-5 text-Icpetgreen" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 flex flex-col min-h-0">
              <div className="border-b shrink-0">
                <Table>
                  <TableHeader>
                    {janitorTable.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id} className="bg-gray-50">
                        {headerGroup.headers.map((header) => (
                          <TableHead
                            key={header.id}
                            style={{ width: `${header.column.columnDef.size * 100}%` }}
                            className="h-8 px-2 py-2 sm:h-10 sm:px-3 sm:py-3 text-left align-middle font-medium text-gray-900 text-xs sm:text-sm"
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                </Table>
              </div>
              <div className="flex-1 overflow-auto">
                <Table>
                  <TableBody>
                    {janitorDataLoading ? (
                      <TableRow>
                        <TableCell colSpan={janitorColumns.length} className="h-24">
                          <div className="flex justify-center items-center h-full">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : janitorTable.getRowModel().rows?.length ? (
                      janitorTable.getRowModel().rows.map((row) => (
                        <TableRow key={row.id} className="hover:bg-gray-50">
                          {row.getVisibleCells().map((cell) => (
                            <TableCell
                              key={cell.id}
                              style={{ width: `${cell.column.columnDef.size * 100}%` }}
                              className="px-2 py-2 sm:px-3 sm:py-3 text-xs sm:text-sm"
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={janitorColumns.length} className="h-24 text-center text-gray-500">
                          No janitor data available.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}