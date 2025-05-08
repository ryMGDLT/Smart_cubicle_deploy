import React, { useState, useEffect } from "react";
import { Card } from "../../../components/ui/card";
import CustomCalendar from "../../../components/calendar/asideCalendar";
import "../../../styles/Calendar.css";
import SummarizedReport from "../../../components/reports/summarizedCard";
import {
  ResourcesUsageChart,
  TrendsOverTimeChart,
  UsageMonitoringChart,
} from "../../../components/charts/mainCharts";
import { toggleMetric } from "../../../components/utils/metricUtils";
import { handleReminderChange } from "../../../components/utils/reminderUtils";
import Reminders from "../../../components/reminder/reminder";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { DateCard } from "../../../components/calendar/dateCard";
import { Avatar, AvatarImage, AvatarFallback } from "../../../components/ui/avatar";
import { DEFAULT_PROFILE_IMAGE } from "../../../data/placeholderData";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend
);

// Define backend URL
// Define backend URL
const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

// Normalize time function (copied from Janitors.js)
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

export default function Dashboard() {
  const [chartType, setChartType] = useState("bar");
  const [trendsChartType, setTrendsChartType] = useState("line");
  const [showDateCard, setShowDateCard] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [remindersChecked, setRemindersChecked] = useState({
    cleaningSchedule: true,
    peakHours: true,
    resourceRestocking: true,
  });
  const [selectedPeriod, setPeriod] = useState("Daily");
  const [selectedMetrics, setSelectedMetrics] = useState([
    "Usage Peak Hour",
    "Total Cleaning Time",
    "Recommended Cleaning Time",
    "Total Resources Restocked",
    "Recommended Resources",
  ]);
  const [janitorSchedules, setJanitorSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const showOtherCards = !showDateCard;

  // Debug remindersChecked and selectedDate changes
  useEffect(() => {
    console.log("Dashboard: remindersChecked updated:", remindersChecked);
    console.log("Dashboard: selectedDate updated:", selectedDate);
  }, [remindersChecked, selectedDate]);

  const handleReminderChangeWrapper = (key) => {
    console.log("Dashboard: Updating remindersChecked", { key, remindersChecked });
    handleReminderChange(setRemindersChecked, key);
  };

  const toggleMetricWrapper = (item) => {
    toggleMetric(setSelectedMetrics, item);
  };

  // Fetch janitor data
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

        // Sort schedules using Janitors.js logic
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

  useEffect(() => {
    const storedShowDateCard = localStorage.getItem("showDateCard") === "true";
    setShowDateCard(storedShowDateCard);
  }, []);

  useEffect(() => {
    localStorage.setItem("selectedMetrics", JSON.stringify(selectedMetrics));
  }, [selectedMetrics]);

  useEffect(() => {
    localStorage.setItem("showDateCard", showDateCard);
  }, [showDateCard]);

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

  return (
    <div className="flex flex-col md:flex-row mt-[-15px] ml-[-15px] mr-[-10px] mx-auto">
      {/* Sidebar */}
      <aside className="w-full md:w-1/4 min-h-screen h-full p-4 flex flex-col mt-[-12px]">
        <Card className="bg-white shadow-lg p-4 flex flex-col h-full overflow-y-auto outline outline-gray-200 outline-1">
          {/* Calendar */}
          <div className="flex justify-center items-center mb-4 overflow-y-auto">
            <CustomCalendar
              handleDateClick={(date) => {
                setSelectedDate(date);
                setShowDateCard(true);
              }}
              today={new Date().getDate()}
            />
          </div>
          <hr className="w-full border-t border-gray-200 my-4 shadow-lg" />

          {/* Reminders Section */}
          <div>
            <Reminders
              remindersChecked={remindersChecked}
              setRemindersChecked={setRemindersChecked}
            />
          </div>
          <hr className="w-full border-t border-gray-200 mt-5 mb-5 shadow-lg" />

          {/* Janitor Schedule */}
          <div className="flex-grow overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Janitor Schedule</h2>
            {loading && <div className="text-center p-2">Loading schedules...</div>}
            {error && <div className="text-red-500 text-center p-2">{error}</div>}
            {!loading && !error && (
              <table className="w-full">
                <thead>
                  <tr className="text-left">
                    <th className="pb-4 text-center">Name</th>
                    <th className="pb-4 text-center">Scheduled</th>
                    <th className="pb-4 text-center">Status</th>
                    <th className="pb-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {janitorSchedules.length > 0 ? (
                    janitorSchedules.map((shift, i) => (
                      <tr
                        key={`${shift.janitorId}-${shift.cleaningHour}-${i}`}
                        className="border-b border-gray-100"
                      >
                        <td className="py-3">
                          <div className="flex items-center justify-center gap-2">
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={shift.image} alt={shift.name} />
                              <AvatarFallback>{shift.name[0] || "N/A"}</AvatarFallback>
                            </Avatar>
                            <span>{shift.name}</span>
                          </div>
                        </td>
                        <td className="py-3 text-center">{formatCleaningHour(shift.cleaningHour)}</td>
                        <td className="py-3 text-center">
                          <span className={getStatusColor(shift.status)}>
                            {shift.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-3 text-center">
                        No schedules available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </aside>

      {/* Main Content */}
      {showOtherCards && (
        <div className="flex-1 p-1 ml-[-5px]">
          <div className="grid grid-cols-1 gap-6">
            {/* Summarized Report */}
            <Card className="bg-white shadow-lg outline outline-gray-200 outline-1 p-4">
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
                showPeriodSelector={true}
                showMetricsDropdown={true}
                showMetricsCards={true}
                showHeader={true}
              />
            </Card>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-white shadow-lg outline outline-gray-200 outline-1 p-4 flex-1 h-auto md:h-[400px]">
                <ResourcesUsageChart
                  chartType={chartType}
                  setChartType={setChartType}
                />
              </Card>
              <Card className="bg-white shadow-lg outline outline-gray-200 outline-1 p-4 flex-1 h-auto md:h-[400px]">
                <TrendsOverTimeChart
                  trendsChartType={trendsChartType}
                  setTrendsChartType={setTrendsChartType}
                />
              </Card>
            </div>

            {/* Usage Monitoring */}
            <Card className="bg-white shadow-lg outline outline-gray-200 outline-1 p-4 flex-1 h-auto md:h-[400px]">
              <UsageMonitoringChart />
            </Card>
          </div>
        </div>
      )}

      {/* Date Card */}
      {showDateCard && (
        <DateCard
          showDateCard={showDateCard}
          setShowDateCard={setShowDateCard}
          remindersChecked={remindersChecked}
          selectedDate={selectedDate}
        />
      )}
    </div>
  );
}