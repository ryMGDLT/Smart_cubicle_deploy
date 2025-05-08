import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import "../../styles/Calendar.css";
import { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import debounce from "lodash/debounce";
import { DateTime } from "luxon";

const MobileCalendar = ({ remindersChecked, onDateClick }) => {
  const [calendarHeight, setCalendarHeight] = useState(600);
  const [peakHourEvents, setPeakHourEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const API_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
  const WS_URL = process.env.REACT_APP_BACKEND_URL
    ? process.env.REACT_APP_BACKEND_URL.replace("http", "ws")
    : "ws://localhost:5000";

  // Fetch peak hour events with debouncing
  const fetchPeakHourEvents = useCallback(
    debounce(async () => {
      try {
        setLoading(true);
        const response = await axios.get(
          `${API_URL}/api/predictions-occupancy/events`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        const normalizedEvents = response.data.map((event) => ({
          ...event,
          title: event.title || "Alert!",
          classNames: event.classNames || ["red-event-style"],
          type: "peak",
          assignedName: event.assignedName || "Peak Hour",
        }));
        console.log("Normalized peak hour events:", normalizedEvents);
        setPeakHourEvents(normalizedEvents);
      } catch (error) {
        console.error("Error fetching peak hour events:", error);
        setPeakHourEvents([]);
      } finally {
        setLoading(false);
      }
    }, 500),
    []
  );

  // Initial fetch of peak hour events
  useEffect(() => {
    fetchPeakHourEvents();
  }, [fetchPeakHourEvents]);

  // WebSocket for real-time updates
  useEffect(() => {
    const ws = new WebSocket(
      `${WS_URL}?token=${localStorage.getItem("token")}`
    );

    ws.onopen = () => {
      console.log("WebSocket connected for MobileCalendar");
    };

    ws.onmessage = (event) => {
      const notification = JSON.parse(event.data);
      console.log("WebSocket message for MobileCalendar:", notification);
      if (notification.type === "peak") {
        console.log("Peak notification received, refetching events:", notification);
        fetchPeakHourEvents();
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected for MobileCalendar");
    };

    ws.onerror = (error) => {
      console.error("WebSocket error for MobileCalendar:", error);
    };

    return () => {
      ws.close();
    };
  }, [fetchPeakHourEvents]);

  // Handle window resize for calendar height
  useEffect(() => {
    const handleResize = () => {
      const viewportHeight = window.innerHeight;
      const newHeight = Math.max(viewportHeight * 0.7, 500);
      setCalendarHeight(newHeight);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleEventDrop = (info) => {
    alert(`Event dropped on: ${info.event.start}`);
  };

  const renderDayCell = (arg) => {
    const today = new Date();
    const cellDate = arg.date;
    if (
      cellDate.getDate() === today.getDate() &&
      cellDate.getMonth() === today.getMonth() &&
      cellDate.getFullYear() === today.getFullYear()
    ) {
      arg.el.style.backgroundColor = "lightgray";
    }
  };

  // Static events
  const staticEvents = [
    {
      id: "1",
      title: "Time to Restock",
      assignedName: "Low Detergent",
      start: DateTime.fromISO("2025-02-06T11:30:00", { zone: "Asia/Manila" }).toJSDate(),
      end: DateTime.fromISO("2025-02-06T12:00:00", { zone: "Asia/Manila" }).toJSDate(),
      classNames: ["black-event-style"],
      type: "schedule",
    },
    {
      id: "2",
      title: "Cleaning Schedule",
      assignedName: "Jane Smith",
      start: DateTime.fromISO("2025-02-06T14:00:00", { zone: "Asia/Manila" }).toJSDate(),
      end: DateTime.fromISO("2025-02-06T14:30:00", { zone: "Asia/Manila" }).toJSDate(),
      classNames: ["blue-event-style"],
      type: "schedule",
    },
    {
      id: "3",
      title: "Cleaning Schedule",
      assignedName: "Alice Johnson",
      start: DateTime.fromISO("2025-02-07T10:00:00", { zone: "Asia/Manila" }).toJSDate(),
      classNames: ["blue-event-style"],
      type: "schedule",
    },
    {
      id: "4",
      title: "Time to Restock",
      assignedName: "Low Detergent",
      start: DateTime.fromISO("2025-02-09T11:30:00", { zone: "Asia/Manila" }).toJSDate(),
      end: DateTime.fromISO("2025-02-09T12:00:00", { zone: "Asia/Manila" }).toJSDate(),
      classNames: ["black-event-style"],
      type: "schedule",
    },
    {
      id: "5",
      title: "Cleaning Schedule",
      assignedName: "Jane Smith",
      start: DateTime.fromISO("2025-02-04T14:00:00", { zone: "Asia/Manila" }).toJSDate(),
      end: DateTime.fromISO("2025-02-04T14:30:00", { zone: "Asia/Manila" }).toJSDate(),
      classNames: ["blue-event-style"],
      type: "schedule",
    },
    {
      id: "6",
      title: "Cleaning Schedule",
      assignedName: "Alice Johnson",
      start: DateTime.fromISO("2025-02-11T10:00:00", { zone: "Asia/Manila" }).toJSDate(),
      classNames: ["blue-event-style"],
      type: "schedule",
    },
    {
      id: "7",
      title: "Alert!",
      assignedName: "Peak Hour",
      start: DateTime.fromISO("2025-02-12T10:00:00", { zone: "Asia/Manila" }).toJSDate(),
      end: DateTime.fromISO("2025-02-12T10:30:00", { zone: "Asia/Manila" }).toJSDate(),
      classNames: ["red-event-style"],
      type: "peak",
    },
    {
      id: "8",
      title: "Alert!",
      assignedName: "Peak Hour",
      start: DateTime.fromISO("2025-02-04T08:00:00", { zone: "Asia/Manila" }).toJSDate(),
      end: DateTime.fromISO("2025-02-04T09:30:00", { zone: "Asia/Manila" }).toJSDate(),
      classNames: ["red-event-style"],
      type: "peak",
    },
    {
      id: "9",
      title: "Time to Restock",
      assignedName: "Low Bleach",
      start: DateTime.fromISO("2025-02-07T13:30:00", { zone: "Asia/Manila" }).toJSDate(),
      end: DateTime.fromISO("2025-02-07T14:00:00", { zone: "Asia/Manila" }).toJSDate(),
      classNames: ["black-event-style"],
      type: "schedule",
    },
  ];

  // Combine and filter events
  const filteredEvents = useMemo(() => {
    console.log("Computing filteredEvents with:", { remindersChecked });

    const events = [
      ...staticEvents,
      ...peakHourEvents.map((event) => ({
        ...event,
        start: new Date(event.start),
        end: event.end ? new Date(event.end) : null,
        type: "peak",
        classNames: event.classNames || ["red-event-style"],
        assignedName: event.assignedName || "Peak Hour",
      })),
    ].filter((event) => {
      // Set visibility based on classNames or title and remindersChecked
      const isVisible =
        (event.title === "Cleaning Schedule" && remindersChecked.cleaningSchedule) ||
        ((event.title === "Alert!" || event.title === "Peak Hour") && remindersChecked.peakHours) ||
        (event.classNames && event.classNames.includes("black-event-style") && remindersChecked.resourceRestocking);

      console.log(
        `Event: ${event.title}, Type: ${event.type}, Visible: ${isVisible}`
      );

      return isVisible;
    });

    console.log("Filtered events:", events);
    return events;
  }, [peakHourEvents, remindersChecked]);

  return (
    <div style={{ height: "100%", overflowY: "auto", position: "relative" }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-50 z-10">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin, listPlugin]}
        initialView="listWeek"
        contentHeight={calendarHeight}
        headerToolbar={{
          left: "title",
          center: "",
          right: "prev,next",
        }}
        timeZone="Asia/Manila"
        views={{
          dayGridMonth: {
            buttonText: "Month",
            dayCellDidMount: renderDayCell,
          },
          listWeek: {
            buttonText: "List",
            listDayFormat: {
             weekday: "long",
              month: "long",
              day: "numeric",
            },
            listDaySideFormat: false,
          },
        }}
        dateClick={onDateClick}
        eventDrop={handleEventDrop}
        events={filteredEvents}
        eventContent={(arg) => {
          const { title, extendedProps, start, end } = arg.event;
          const assignedName = extendedProps.assignedName || "Unassigned";
          const startTime = start
            ? DateTime.fromJSDate(start, { zone: "Asia/Manila" })
                .minus({ hours: 8 })
                .toLocaleString({
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })
            : "No Start Time";
          const endTime = end
            ? DateTime.fromJSDate(end, { zone: "Asia/Manila" })
                .minus({ hours: 8 })
                .toLocaleString({
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })
            : "No End Time";
          const timeRange = end ? `${startTime} - ${endTime}` : startTime;
          return (
            <div>
              <strong className="event-title">{title}</strong>
              <div className="event-assigned-name">{assignedName}</div>
              <div className="event-time">{timeRange}</div>
            </div>
          );
        }}
      />
    </div>
  );
};

export default MobileCalendar;