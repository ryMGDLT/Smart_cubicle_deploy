import React, { useState, useEffect } from "react"; // Added useEffect
import { Card } from "../../../components/ui/card";
import SummarizedReport from "../../../components/reports/summarizedCard";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../../components/ui/dropdown-menu";
import { toggleMetric } from "../../../components/utils/metricUtils";
import {
  ResourcesUsageChart,
  TrendsOverTimeChart,
  UsageMonitoringChart,
} from "../../../components/charts/mainCharts";
import CustomCalendar from "../../../components/calendar/asideCalendar";
import MobileCalendar from "../../../components/calendar/mobileCalendar";
import Reminders from "../../../components/reminder/reminder";
import { Avatar, AvatarImage, AvatarFallback } from "../../../components/ui/avatar"; // Added Avatar components
import { DEFAULT_PROFILE_IMAGE } from "../../../data/placeholderData"; // Added placeholder image

// Define backend URL
const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

// Normalize time function (copied from first code)
const normalizeTime = (time) => {
  if (!time) return null;
  const timeStr = String(time).trim();
  const timeFormats = [
    /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i, // e.g., "9:30 AM"
    /^(\d{1,2}):(\d{2})$/, // e.g., "14:30"
    /^(\d{1,2})\s*(AM|PM)$/i, // e.g., "9 AM"
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

// Format cleaning hour to AM/PM (copied from first code)
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

// Get status color (copied from first code)
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

const Modal = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md h-auto p-3 relative mr-2 ml-2">
        <button
          onClick={onClose}
          className="absolute top-2 right-5 text-gray-500 hover:text-gray-700 text-3xl"
        >
          ×
        </button>
        {/* Modal Content */}
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const [selectedPeriod, setPeriod] = useState("Daily");
  const [selectedMetrics, setSelectedMetrics] = useState([
    "Usage Peak Hour",
    "Total Cleaning Time",
    "Recommended Cleaning Time",
    "Total Resources Restocked",
    "Recommended Resources",
  ]);
  const [activeButton, setActiveButton] = useState("charts");
  const [chartType, setChartType] = useState("bar");
  const [trendsChartType, setTrendsChartType] = useState("line");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [remindersChecked, setRemindersChecked] = useState({
    cleaningSchedule: true,
    peakHours: true,
    resourceRestocking: true,
  });
  const [janitorSchedules, setJanitorSchedules] = useState([]); // Added state for schedules
  const [loading, setLoading] = useState(true); // Added loading state
  const [error, setError] = useState(null); // Added error state

  const toggleMetricWrapper = (item) => {
    toggleMetric(setSelectedMetrics, item);
  };

  const handleDateClick = (date) => {
    setSelectedDate(date);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  // Fetch janitor data (copied from first code)
  useEffect(() => {
    const fetchJanitors = async () => {
      try {
        console.log(`Fetching janitors from ${backendUrl}/janitors`);
        const response = await fetch(`${backendUrl}/janitors?ts=${Date.now()}`);
        if (!response.ok) throw new Error(`Failed to fetch janitors: ${response.statusText}`);
        const data = await response.json();
        console.log("Janitor API Response:", data);

        // Map all schedule entries
        const allSchedules = data.flatMap((janitor) =>
          (janitor.schedule || []).map((entry) => ({
            janitorId: janitor._id,
            name: janitor.basicDetails?.name || "N/A",
            image: janitor.basicDetails?.image || DEFAULT_PROFILE_IMAGE,
            cleaningHour: entry.cleaningHour || "N/A",
            status: entry.status || "Pending",
            date: entry.date || null,
            shift: entry.shift || null,
          }))
        );

        // Sort schedules
        const sortedSchedules = allSchedules.sort((a, b) => {
          const parseDate = (dateStr) => {
            if (!dateStr) return new Date(0);
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
          if (dateDiff !== 0) {
            return dateDiff;
          }

          const parseShift = (shift) => {
            if (!shift) return 0;
            const shiftPriority = { evening: 3, afternoon: 2, morning: 1 };
            return shiftPriority[shift.toLowerCase()] || 0;
          };

          const shiftA = parseShift(a.shift);
          const shiftB = parseShift(b.shift);
          if (shiftA !== shiftB) {
            return shiftB - shiftA;
          }

          const parseCleaningHour = (time) => {
            const normalized = normalizeTime(time);
            if (!normalized) return 0;
            const [hours, minutes] = normalized.split(":").map(Number);
            return hours * 60 + minutes;
          };

          const timeA = parseCleaningHour(a.cleaningHour);
          const timeB = parseCleaningHour(b.cleaningHour);
          return timeB - timeA;
        });

        // Take only the top 5 latest schedules
        setJanitorSchedules(sortedSchedules.slice(0, 5));
        setError(null);
      } catch (error) {
        console.error("Error fetching janitor data:", error.message);
        setError("Failed to load janitor schedules. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    fetchJanitors();
  }, []);

  return (
    <div className="flex flex-col mt-[-10px]">
      {/* Summarized Report Section */}
      <Card className="bg-white shadow-lg p-4 outline outline-gray-200 outline-1">
        <h3 className="text-2xl font-bold mb-4">Summarized Report</h3>
        <div className="flex gap-2 justify-end mb-3">
          {/* Period Selector */}
          <div className="flex space-x-0">
            {["Daily", "Weekly", "Monthly"].map((period, index) => (
              <button
                key={period}
                onClick={() => setPeriod(period)}
                className={`px-3 py-1 text-sm transition-colors ${
                  selectedPeriod === period
                    ? "bg-teal-600 text-white hover:bg-teal-800"
                    : "border border-gray-300 hover:bg-gray-300"
                } ${
                  index === 0
                    ? "rounded-l-md"
                    : index === 2
                    ? "rounded-r-md"
                    : ""
                }`}
              >
                {period}
              </button>
            ))}
          </div>
          {/* Metrics Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="p-2 hover:bg-gray-100 rounded-full">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-gray-500"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" />
              </svg>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-teal-600 p-1">
              {[
                "Usage Peak Hour",
                "Total Cleaning Time",
                "Recommended Cleaning Time",
                "Total Resources Restocked",
                "Recommended Resources",
              ].map((item, index) => (
                <DropdownMenuItem
                  key={index}
                  onClick={() => toggleMetricWrapper(item)}
                  className={`px-4 py-2 hover:bg-teal-700 text-white ${
                    index !== 4 ? "border-b border-white" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 bg-white rounded-sm flex items-center justify-center"
                      style={{ border: "1px solid #ccc" }}
                    >
                      {selectedMetrics.includes(item) && (
                        <svg
                          className="w-4 h-4 text-teal-700"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm">{item}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* SummarizedReport Component */}
        <div className="flex overflow-x-auto">
          <SummarizedReport
            selectedPeriod={selectedPeriod}
            setSelectedPeriod={setPeriod}
            allMetrics={[
              "Usage Peak Hour",
              "Total Cleaning Time",
              "Recommended Cleaning Time",
              "Total Resources Restocked",
              "Recommended Resources",
            ]}
            selectedMetrics={selectedMetrics}
            toggleMetric={toggleMetricWrapper}
            showDropdown={true}
            setShowDropdown={setSelectedMetrics}
            showPeriodSelector={false}
            showMetricsDropdown={false}
            showMetricsCards={true}
            showHeader={false}
          />
        </div>
      </Card>
      {/* Charts/Reports Section */}
      <Card className="bg-white shadow-lg outline outline-1 outline-gray-200 mt-4 p-2 rounded-lg h-full">
        {/* Buttons */}
        <div className="flex space-x-2 mb-2 justify-center items-center mr-1 mt-2">
          <button
            className={`${
              activeButton === "charts"
                ? "text-white font-semibold"
                : "text-black"
            } px-4 py-2 rounded-lg text-sm ${
              activeButton === "charts" ? "bg-teal-600" : "bg-none"
            }`}
            onClick={() => setActiveButton("charts")}
          >
            Chart Reports
          </button>
          <button
            className={`${
              activeButton === "reports"
                ? "text-white font-semibold"
                : "text-black"
            } px-4 py-2 rounded-lg text-sm ${
              activeButton === "reports" ? "bg-teal-600" : "bg-none"
            }`}
            onClick={() => setActiveButton("reports")}
          >
            Event Calendar
          </button>
        </div>
        <div className="p-1">
          {activeButton === "charts" && (
            <div>
              <div className="flex flex-col mt-1">
                <div className="flex flex-col gap-4 h-[350px]">
                  <ResourcesUsageChart
                    chartType={chartType}
                    setShowChartDropdown={setSelectedMetrics}
                    showChartDropdown={selectedMetrics.includes(
                      "Usage Peak Hour"
                    )}
                    setChartType={setChartType}
                  />
                </div>
                <hr className="w-full border-t border-gray-200 mt-5 mb-5 shadow-lg" />
                <div className="flex flex-col gap-4 h-[350px]">
                  <TrendsOverTimeChart
                    trendsChartType={trendsChartType}
                    setShowTrendsDropdown={setSelectedMetrics}
                    showTrendsDropdown={selectedMetrics.includes(
                      "Usage Peak Hour"
                    )}
                    setTrendsChartType={setTrendsChartType}
                  />
                </div>
                <hr className="w-full border-t border-gray-200 mt-5 mb-5 shadow-lg" />
                <div className="flex flex-col gap-4 h-[350px]">
                  <UsageMonitoringChart />
                </div>
              </div>
            </div>
          )}
          {activeButton === "reports" && (
            <div className="flex flex-col items-center h-full">
              <div className="flex justify-center w-full mb-4">
                <div className="max-w-[350px]">
                  <CustomCalendar
                    handleDateClick={handleDateClick}
                    today={new Date().getDate()}
                  />
                </div>
              </div>
              <hr className="w-full border-t border-gray-200 mt-[-10px] mb-3 shadow-lg" />
              <div className="mb-2 w-full">
                <div className="w-full">
                  <Reminders
                    remindersChecked={remindersChecked}
                    setRemindersChecked={setRemindersChecked}
                  />
                </div>
              </div>
              <hr className="w-full border-t border-gray-200 mt-4 mb-5 shadow-lg" />
              <div className="flex flex-col gap-4 w-full">
                <h2 className="text-xl font-bold mb-4">
                  Janitor Schedule (Today)
                </h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="text-left">
                        <th className="pb-4">Name</th>
                        <th className="pb-4">Scheduled</th>
                        <th className="pb-4">Status</th>
                        <th className="pb-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr>
                          <td colSpan={4} className="py-3 text-center">
                            Loading schedules...
                          </td>
                        </tr>
                      )}
                      {error && (
                        <tr>
                          <td colSpan={4} className="py-3 text-center text-red-500">
                            {error}
                          </td>
                        </tr>
                      )}
                      {!loading && !error && janitorSchedules.length > 0 ? (
                        janitorSchedules.map((shift, i) => (
                          <tr
                            key={`${shift.janitorId}-${shift.cleaningHour}-${i}`}
                            className="border-b border-gray-100"
                          >
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                <Avatar className="w-8 h-8">
                                  <AvatarImage src={shift.image} alt={shift.name} />
                                  <AvatarFallback>{shift.name[0] || "N/A"}</AvatarFallback>
                                </Avatar>
                                <span>{shift.name}</span>
                              </div>
                            </td>
                            <td className="py-3">{formatCleaningHour(shift.cleaningHour)}</td>
                            <td className="py-3">
                              <span className={getStatusColor(shift.status)}>
                                {shift.status}
                              </span>
                            </td>
                            <td className="py-3 text-right">⋮</td>
                          </tr>
                        ))
                      ) : (
                        !loading &&
                        !error && (
                          <tr>
                            <td colSpan={4} className="py-3 text-center">
                              No schedules available.
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
      {/* Modal */}
      <Modal isOpen={isModalOpen} onClose={closeModal}>
        <h2 className="text-2xl font-bold mb-4 mt-4">Event Calendar</h2>
        <div className="mobileCalendar mb-4" style={{ height: "auto" }}>
          <MobileCalendar
            remindersChecked={remindersChecked}
            onDateClick={handleDateClick}
          />
        </div>
      </Modal>
    </div>
  );
}