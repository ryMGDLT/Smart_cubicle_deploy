"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Printer, Search } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Card } from "../../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "../../../components/ui/pagination";
import { cn } from "../../../lib/utils";
import { basicColumns } from "../../../components/tables/janitor/basic-columns";
import {
  scheduleColumns,
  normalizeTime,
} from "../../../components/tables/janitor/schedule-columns";
import { performanceTrackColumns } from "../../../components/tables/janitor/performance-column";
import { resourceUsageColumns } from "../../../components/tables/janitor/resource-column";
import { logsReportColumns } from "../../../components/tables/janitor/logs-column";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { DEFAULT_PROFILE_IMAGE } from "../../../data/placeholderData";
import { useAuth } from "../../../components/controller/authController";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";

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

// Helper function to truncate text
const truncateText = (text, maxWidth, fontSize, doc) => {
  let truncated = String(text || "N/A");
  doc.setFontSize(fontSize);
  while (doc.getTextWidth(truncated) > maxWidth - 4 && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  if (truncated.length < String(text || "N/A").length) {
    truncated = truncated.slice(0, -3) + "...";
  }
  return truncated;
};

// Function to format duration from "hh:mm" to total minutes with "mins" suffix
const formatDuration = (duration) => {
  if (
    !duration ||
    typeof duration !== "string" ||
    !/^\d{2}:\d{2}$/.test(duration)
  ) {
    console.log("Invalid duration format:", duration);
    return "N/A";
  }

  try {
    const [hours, minutes] = duration.split(":").map(Number);
    const totalMinutes = hours * 60 + minutes;
    return `${totalMinutes} mins`;
  } catch (error) {
    console.error("Error formatting duration:", duration, error);
    return "N/A";
  }
};

// Function to format time with AM/PM, adjusting hours for startTime/endTime
const formatCleaningHour = (time, isGeneratedCleaningHour = false) => {
  console.log(
    "Formatting Time:",
    time,
    "isGeneratedCleaningHour:",
    isGeneratedCleaningHour
  );
  const normalizedTime = normalizeTime(time);
  if (!normalizedTime) {
    return "N/A";
  }

  try {
    let [hours, minutes] = normalizedTime.split(":").map(Number);

    if (!isGeneratedCleaningHour) {
      hours = (hours - 8 + 24) % 24; // Adjust for UTC-8
    }

    const period = hours >= 12 ? "PM" : "AM";
    const formattedHour = hours % 12 || 12;

    return `${formattedHour}:${minutes.toString().padStart(2, "0")} ${period}`;
  } catch (error) {
    console.error("Error formatting time:", time, error);
    return "N/A";
  }
};

// Function to format hours for performanceTrack (e.g., "2.30" to "2 hours 30 minutes")
const formatHours = (hoursStr) => {
  if (!hoursStr || isNaN(parseFloat(hoursStr))) return "0 hours";
  const [hours, minutes] = hoursStr.split(".").map(Number);
  const hoursNum = hours || 0;
  const minutesNum = minutes || 0;

  if (hoursNum === 0 && minutesNum === 0) return "0 hours";
  if (hoursNum === 0) return `${minutesNum} minutes`;
  if (minutesNum === 0) return `${hoursNum} hours`;
  return `${hoursNum} hours ${minutesNum} minutes`;
};

const TABS = [
  "Basic Details",
  "Schedule",
  "Performance Track",
  "Resource Usage",
  "Logs and Report",
];

export default function Janitors() {
  const [activeTab, setActiveTab] = useState("Basic Details");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [janitorsData, setJanitorsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    janitorId: "",
    date: "",
    timeIn: "",
    timeOut: "",
    task: "Cleaning Restroom",
    shift: "Morning",
    status: "Pending",
  });
  const itemsPerPage = 10;
  const { user } = useAuth();
  const userRole = user?.role;
  const backendUrl =
    process.env.REACT_APP_BACKEND_URL || "http://192.168.5.45:5000";

  // Debounce utility
  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  const fetchJanitors = async () => {
    try {
      const response = await fetch(`${backendUrl}/janitors?ts=${Date.now()}`);
      if (!response.ok)
        throw new Error(`Failed to fetch janitors: ${response.statusText}`);
      const data = await response.json();
      console.log("Fetched Janitors Data:", data);
      setJanitorsData(data);
    } catch (error) {
      console.error("Fetch error:", error);
      setError(error.message);
    }
  };

  const fetchJanitorsDebounced = useMemo(() => debounce(fetchJanitors, 1000), []);

  const handleProfileUpdate = async (janitorId, updatedProfile) => {
    try {
      const response = await fetch(
        `${backendUrl}/janitors/${janitorId}/profile`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatedProfile),
        }
      );
      if (!response.ok) throw new Error("Failed to update profile");
      console.log("Profile updated successfully for janitor:", janitorId);
      await fetchJanitorsDebounced();
    } catch (error) {
      console.error("Error updating profile:", error);
      throw error;
    }
  };

  const handleGenerateSchedule = () => {
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setScheduleForm({
      janitorId: "",
      date: "",
      timeIn: "",
      timeOut: "",
      task: "Cleaning Restroom",
      shift: "Morning",
      status: "Pending",
    });
  };

  const handleScheduleSubmit = async () => {
    try {
      const { janitorId, date, timeIn, timeOut, task, shift, status } = scheduleForm;
      if (!janitorId || !date || !timeIn || !timeOut) {
        alert("Please fill in all required fields.");
        return;
      }

      // Format date to MM/DD/YYYY
      const formattedDate = new Date(date).toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });

      const scheduleData = {
        date: formattedDate,
        timeIn: normalizeTime(timeIn),
        timeOut: normalizeTime(timeOut),
        cleaningHour: normalizeTime(timeIn), // Assuming cleaningHour starts at timeIn
        task,
        shift,
        status,
        image: janitorsData.find((j) => j._id === janitorId)?.basicDetails?.image || "",
        name: janitorsData.find((j) => j._id === janitorId)?.basicDetails?.name || "Unknown",
      };

      const response = await fetch(`${backendUrl}/janitors/${janitorId}/schedule`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ schedule: scheduleData }),
      });

      if (!response.ok) {
        throw new Error("Failed to assign schedule");
      }

      console.log("Schedule assigned successfully for janitor:", janitorId);
      await fetchJanitorsDebounced();
      handleModalClose();
    } catch (error) {
      console.error("Error assigning schedule:", error);
      alert("Failed to assign schedule: " + error.message);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setScheduleForm((prev) => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    setLoading(true);
    fetchJanitors().finally(() => setLoading(false));
    const interval = setInterval(() => {
      fetchJanitorsDebounced();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchJanitorsDebounced]);

  console.log("Logged-in User:", user);

  const mappedJanitorsData = useMemo(() => {
    const mappedData = janitorsData.map((janitor) => ({
      _id: janitor._id || "N/A",
      basicDetails: {
        image: janitor.basicDetails?.image || DEFAULT_PROFILE_IMAGE,
        name: janitor.basicDetails?.name || "Unknown",
        employeeId: janitor.basicDetails?.employeeId || "N/A",
        email: janitor.basicDetails?.email || "N/A",
        contact: janitor.basicDetails?.contact || "N/A",
      },
      schedule: janitor.schedule?.length > 0
        ? janitor.schedule.map((entry) => ({
            ...entry,
            image: janitor.basicDetails?.image || DEFAULT_PROFILE_IMAGE,
            generatedCleaningHour: entry.cleaningHour,
          }))
        : [],
      performanceTrack: janitor.performanceTrack?.length > 0
        ? janitor.performanceTrack.map((entry) => ({
            ...entry,
            image: janitor.basicDetails?.image || DEFAULT_PROFILE_IMAGE,
            name: janitor.basicDetails?.name || "Unknown",

            employeeId: janitor.basicDetails?.employeeId || "N/A",
          }))
        : [
            {
              image: janitor.basicDetails?.image || DEFAULT_PROFILE_IMAGE,
              name: janitor.basicDetails?.name || "Unknown",
              employeeId: janitor.basicDetails?.employeeId || "N/A",
              today: "0.00",
              thisWeek: "0.00",
              thisMonth: "0.00",
              thisYear: "0.00",
              maxCleaningHour: "0.00",
              minCleaningHour: "0.00",
              status: "",
            },
          ],
      resourceUsage: janitor.resourceUsage?.length > 0
        ? janitor.resourceUsage.map((entry) => ({
            ...entry,
            image: janitor.basicDetails?.image || DEFAULT_PROFILE_IMAGE,
            name: janitor.basicDetails?.name || "Unknown",
            employeeId: janitor.basicDetails?.employeeId || "N/A",
          }))
        : [],
      logsReport: janitor.logsReport?.length > 0
        ? janitor.logsReport.map((entry) => ({
            ...entry,
            image: janitor.basicDetails?.image || DEFAULT_PROFILE_IMAGE,
            name: janitor.basicDetails?.name || "Unknown",
            employeeId: janitor.basicDetails?.employeeId || "N/A",
          }))
        : [],
    }));
    console.log("Mapped Janitors Data:", mappedData);
    return mappedData;
  }, [janitorsData]);

  const filteredJanitors = useMemo(() => {
    let roleFilteredData = mappedJanitorsData;

    // Apply role-based filtering only for Janitor role
    if (userRole === "Janitor" && user?.email) {
      roleFilteredData = mappedJanitorsData.filter(
        (janitor) => janitor.basicDetails.email === user.email
      );
    }

    const filteredData = roleFilteredData.filter((janitor) => {
      const tabProperty = activeTab.toLowerCase().replace(/\s+/g, "");
      const propertyKey =
        {
          basicdetails: "basicDetails",
          logsandreport: "logsReport",
          performancetrack: "performanceTrack",
          resourceusage: "resourceUsage",
          schedule: "schedule",
        }[tabProperty] || tabProperty;

      if (propertyKey === "basicDetails") {
        const searchFields = [
          janitor.basicDetails.name,
          janitor.basicDetails.employeeId,
          janitor.basicDetails.email,
          janitor.basicDetails.contact,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchFields.includes(searchTerm.toLowerCase());
      }

      const data = janitor[propertyKey] || [];
      if (data.length === 0) {
        return false;
      }

      if (propertyKey === "resourceUsage") {
        return data
          .filter((entry) => {
            const amountUsed = entry.amountUsed || "0 ml";
            const amountValue = parseFloat(amountUsed.replace(" ml", "")) || 0;
            return amountValue > 0;
          })
          .some((entry) =>
            Object.values(entry)
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(searchTerm.toLowerCase())
          );
      }

      return data.some((entry) =>
        Object.values(entry)
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(searchTerm.toLowerCase())
      );
    });

    console.log("Filtered Janitors:", filteredData);
    return filteredData;
  }, [searchTerm, activeTab, mappedJanitorsData, userRole, user?.email]);

  const currentItems = useMemo(() => {
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const tabProperty = activeTab.toLowerCase().replace(/\s+/g, "");
    const propertyKey =
      {
        basicdetails: "basicDetails",
        logsandreport: "logsReport",
        performancetrack: "performanceTrack",
        resourceusage: "resourceUsage",
        schedule: "schedule",
      }[tabProperty] || tabProperty;

    if (propertyKey === "basicDetails") {
      return filteredJanitors.slice(indexOfFirstItem, indexOfLastItem);
    }

    if (propertyKey === "schedule") {
      const allScheduleEntries = filteredJanitors.flatMap((janitor) =>
        (janitor.schedule || []).map((entry) => ({
          ...janitor,
          schedule: entry,
        }))
      );

      const sortedEntries = allScheduleEntries.sort((a, b) => {
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

        const dateA = parseDate(a.schedule.date);
        const dateB = parseDate(b.schedule.date);
        const dateDiff = dateB.getTime() - dateA.getTime();
        if (dateDiff !== 0) {
          return dateDiff;
        }

        const parseShift = (shift) => {
          if (!shift) return 0;
          const shiftPriority = { evening: 3, afternoon: 2, morning: 1 };
          return shiftPriority[shift.toLowerCase()] || 0;
        };

        const shiftA = parseShift(a.schedule.shift);
        const shiftB = parseShift(b.schedule.shift);
        if (shiftA !== shiftB) {
          return shiftB - shiftA;
        }

        const parseCleaningHour = (time) => {
          const normalized = normalizeTime(time);
          if (!normalized) return 0;
          const [hours, minutes] = normalized.split(":").map(Number);
          return hours * 60 + minutes;
        };

        const timeA = parseCleaningHour(a.schedule.generatedCleaningHour);
        const timeB = parseCleaningHour(b.schedule.generatedCleaningHour);
        return timeB - timeA;
      });

      const paginatedItems = sortedEntries.slice(
        indexOfFirstItem,
        indexOfLastItem
      );
      return paginatedItems.map((item) => ({
        ...item,
        [propertyKey]: item.schedule,
      }));
    }

    if (propertyKey === "logsReport") {
      const allLogsEntries = filteredJanitors.flatMap((janitor) =>
        (janitor.logsReport || []).map((entry) => ({
          ...janitor,
          logsReport: entry,
        }))
      );

      const sortedEntries = allLogsEntries.sort((a, b) => {
        const isAEmpty =
          !normalizeTime(a.logsReport.startTime) &&
          !normalizeTime(a.logsReport.endTime);
        const isBEmpty =
          !normalizeTime(b.logsReport.startTime) &&
          !normalizeTime(b.logsReport.endTime);

        if (isAEmpty && !isBEmpty) return -1;
        if (!isAEmpty && isBEmpty) return 1;

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

        const dateA = parseDate(a.logsReport.date);
        const dateB = parseDate(b.logsReport.date);
        const dateDiff = dateB.getTime() - dateA.getTime();
        if (dateDiff !== 0) return dateDiff;

        if (isAEmpty && isBEmpty) return 0;

        const parseStartTime = (time) => {
          const normalized = normalizeTime(time);
          if (!normalized) return 0;
          const [hours, minutes] = normalized.split(":").map(Number);
          return hours * 60 + minutes;
        };

        const timeA = parseStartTime(a.logsReport.startTime);
        const timeB = parseStartTime(b.logsReport.startTime);
        return timeB - timeA;
      });

      const paginatedItems = sortedEntries.slice(
        indexOfFirstItem,
        indexOfLastItem
      );
      return paginatedItems.map((item) => ({
        ...item,
        [propertyKey]: item.logsReport,
      }));
    }

    if (propertyKey === "performanceTrack") {
      const allPerformanceEntries = filteredJanitors
        .map((janitor) =>
          (janitor.performanceTrack || []).map((entry) => ({
            ...janitor,
            performanceTrack: entry,
          }))
        )
        .flat();

      return allPerformanceEntries.slice(indexOfFirstItem, indexOfLastItem);
    }

    if (propertyKey === "resourceUsage") {
      // Get schedule entries to determine name order
      const allScheduleEntries = filteredJanitors.flatMap((janitor) =>
        (janitor.schedule || []).map((entry) => ({
          ...janitor,
          schedule: entry,
        }))
      );

      const sortedScheduleEntries = allScheduleEntries.sort((a, b) => {
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

        const dateA = parseDate(a.schedule.date);
        const dateB = parseDate(b.schedule.date);
        const dateDiff = dateB.getTime() - dateA.getTime();
        if (dateDiff !== 0) {
          return dateDiff;
        }

        const parseShift = (shift) => {
          if (!shift) return 0;
          const shiftPriority = { evening: 3, afternoon: 2, morning: 1 };
          return shiftPriority[shift.toLowerCase()] || 0;
        };

        const shiftA = parseShift(a.schedule.shift);
        const shiftB = parseShift(b.schedule.shift);
        if (shiftA !== shiftB) {
          return shiftB - shiftA;
        }

        const parseCleaningHour = (time) => {
          const normalized = normalizeTime(time);
          if (!normalized) return 0;
          const [hours, minutes] = normalized.split(":").map(Number);
          return hours * 60 + minutes;
        };

        const timeA = parseCleaningHour(a.schedule.generatedCleaningHour);
        const timeB = parseCleaningHour(b.schedule.generatedCleaningHour);
        return timeB - timeA;
      });

      const orderedNames = sortedScheduleEntries
        .map((entry) => entry.basicDetails?.name || "Unknown")
        .filter((name, index, self) => self.indexOf(name) === index);

      // Get all resource usage entries with non-zero amountUsed
      const allResourceEntries = filteredJanitors
        .flatMap((janitor) =>
          (janitor.resourceUsage || []).map((entry, index) => ({
            ...janitor,
            resourceUsage: { ...entry, originalIndex: index },
          }))
        )
        .filter((item) => {
          const amountUsed = item.resourceUsage?.amountUsed || "0 ml";
          const amountValue = parseFloat(amountUsed.replace(" ml", "")) || 0;
          return amountValue > 0;
        });

      // Group entries by janitor name
      const entriesByName = allResourceEntries.reduce((acc, entry) => {
        const name = entry.basicDetails?.name || "Unknown";
        if (!acc[name]) {
          acc[name] = [];
        }
        acc[name].push(entry);
        return acc;
      }, {});

      // Sort entries within each janitor by original index (descending, so later entries are first)
      Object.keys(entriesByName).forEach((name) => {
        entriesByName[name].sort(
          (a, b) =>
            b.resourceUsage.originalIndex - a.resourceUsage.originalIndex
        );
      });

      // Collect top 4 entries per janitor and remaining entries
      const topEntries = [];
      const remainingEntries = [];
      Object.keys(entriesByName).forEach((name) => {
        const entries = entriesByName[name];
        // Take top 4 entries
        topEntries.push(...entries.slice(0, 4));
        // Collect remaining entries
        remainingEntries.push(...entries.slice(4));
      });

      // Sort top entries by schedule name order and maintain recency within janitor
      topEntries.sort((a, b) => {
        const nameA = a.basicDetails?.name || "Unknown";
        const nameB = b.basicDetails?.name || "Unknown";
        const indexA = orderedNames.indexOf(nameA);
        const indexB = orderedNames.indexOf(nameB);

        if (indexA !== -1 && indexB !== -1) {
          if (indexA !== indexB) {
            return indexA - indexB;
          }
          // Within same janitor, maintain original index order (recency)
          return b.resourceUsage.originalIndex - a.resourceUsage.originalIndex;
        }
        if (indexA === -1 && indexB !== -1) return 1;
        if (indexB === -1 && indexA !== -1) return -1;
        return nameA.localeCompare(nameB);
      });

      // Sort remaining entries by schedule name order and resource type
      const resourceOrder = [
        "Chlorox",
        "Multipurpose Cleaner",
        "Toilet Bowl Cleaner",
        "Glass and Mirror Cleaner",
      ];
      remainingEntries.sort((a, b) => {
        const nameA = a.basicDetails?.name || "Unknown";
        const nameB = b.basicDetails?.name || "Unknown";
        const indexA = orderedNames.indexOf(nameA);
        const indexB = orderedNames.indexOf(nameB);

        if (indexA !== -1 && indexB !== -1) {
          if (indexA !== indexB) {
            return indexA - indexB;
          }
          // Within same janitor, sort by resource type
          const resourceA = a.resourceUsage?.resource || "";
          const resourceB = b.resourceUsage?.resource || "";
          return (
            resourceOrder.indexOf(resourceA) - resourceOrder.indexOf(resourceB)
          );
        }
        if (indexA === -1 && indexB !== -1) return 1;
        if (indexB === -1 && indexA !== -1) return -1;
        return nameA.localeCompare(nameB);
      });

      // Combine top entries and remaining entries
      const sortedResourceEntries = [...topEntries, ...remainingEntries];

      return sortedResourceEntries.slice(indexOfFirstItem, indexOfLastItem);
    }

    const allEntries = filteredJanitors.flatMap((janitor) => {
      const entries =
        janitor[propertyKey] && janitor[propertyKey].length > 0
          ? janitor[propertyKey]
          : [];
      return [...entries].reverse().map((entry) => ({
        ...janitor,
        [propertyKey]: entry,
      }));
    });

    return allEntries.slice(indexOfFirstItem, indexOfLastItem);
  }, [currentPage, filteredJanitors, activeTab]);

  const totalItems = useMemo(() => {
    const tabProperty = activeTab.toLowerCase().replace(/\s+/g, "");
    const propertyKey =
      {
        basicdetails: "basicDetails",
        logsandreport: "logsReport",
        performancetrack: "performanceTrack",
        resourceusage: "resourceUsage",
        schedule: "schedule",
      }[tabProperty] || tabProperty;

    if (propertyKey === "basicDetails") {
      return filteredJanitors.length;
    }

    if (propertyKey === "resourceUsage") {
      return filteredJanitors.reduce(
        (count, janitor) =>
          count +
          (janitor.resourceUsage || []).filter((entry) => {
            const amountUsed = entry.amountUsed || "0 ml";
            const amountValue = parseFloat(amountUsed.replace(" ml", "")) || 0;
            return amountValue > 0;
          }).length,
        0
      );
    }

    return filteredJanitors.reduce(
      (count, janitor) => count + (janitor[propertyKey]?.length || 0),
      0
    );
  }, [filteredJanitors, activeTab]);

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handlePageChange = (page) => setCurrentPage(page);
  const handlePrevPage = () => setCurrentPage((prev) => Math.max(1, prev - 1));
  const handleNextPage = () =>
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));

  const getActiveColumns = () => {
    switch (activeTab) {
      case "Basic Details":
        return basicColumns;
      case "Schedule":
        return scheduleColumns(fetchJanitorsDebounced);
      case "Performance Track":
        return performanceTrackColumns(fetchJanitorsDebounced);
      case "Resource Usage":
        return resourceUsageColumns({ fetchJanitorsDebounced });
      case "Logs and Report":
        return logsReportColumns(fetchJanitorsDebounced);
      default:
        return basicColumns;
    }
  };

  const generatePDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");

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
          doc.addImage(
            watermarkBase64,
            "PNG",
            centerX,
            centerY,
            watermarkWidth,
            watermarkHeight
          );
        }
      };

      const logoUrl = "/images/ICPET.png";
      const logoBase64 = await loadImageAsBase64(logoUrl);
      if (logoBase64) {
        const logoWidth = 25;
        const logoHeight = 25;
        const logoX = pageWidth - margin - logoWidth - 5;
        const logoY = margin - 5;
        doc.addImage(logoBase64, "PNG", logoX, logoY, logoWidth, logoHeight);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(0, 51, 102);
      doc.text(`${activeTab} Report`, margin, y);
      const titleWidth = doc.getTextWidth(`${activeTab} Report`);
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

      const tabProperty = activeTab.toLowerCase().replace(/\s+/g, "");
      const propertyKey =
        {
          basicdetails: "basicDetails",
          logsandreport: "logsReport",
          performancetrack: "performanceTrack",
          resourceusage: "resourceUsage",
          schedule: "schedule",
        }[tabProperty] || tabProperty;

      let tableData = [];
      let headers = [];
      let columnWidths = [];

      if (propertyKey === "basicDetails") {
        tableData = filteredJanitors.map((janitor) => [
          janitor.basicDetails.name || "Unknown",
          janitor.basicDetails.employeeId || "N/A",
          janitor.basicDetails.email || "N/A",
          janitor.basicDetails.contact || "N/A",
        ]);
        headers = ["Name", "Employee ID", "Email", "Contact"];
        columnWidths = [70, 50, 80, 60];
      } else if (propertyKey === "schedule") {
        tableData = filteredJanitors
          .flatMap((janitor) =>
            (janitor.schedule || []).map((entry) => [
              janitor.basicDetails.name || "Unknown",
              entry.date || "N/A",
              entry.shift || "N/A",
              formatCleaningHour(entry.timeIn, false) || "N/A",
              formatCleaningHour(entry.timeOut, false) || "N/A",
              formatCleaningHour(entry.generatedCleaningHour, true) || "N/A",
              entry.task || "N/A",
              entry.status || "N/A",
            ])
          )
          .sort((a, b) => {
            const parseDate = (dateStr) => {
              if (!dateStr) return new Date(0);
              let date;
              if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
                const [month, day, year] = dateStr.split("/").map(Number);
                date = new Date(month - 1, day);
              } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                date = new Date(dateStr);
              } else {
                return new Date(0);
              }
              return date && !isNaN(date.getTime()) ? date : new Date(0);
            };
            return parseDate(b[1]).getTime() - parseDate(a[1]).getTime();
          });
        headers = [
          "Name",
          "Date",
          "Shift",
          "Time In",
          "Time Out",
          "Generated Cleaning Hour",
          "Task",
          "Status",
        ];
        columnWidths = [50, 40, 30, 30, 30, 40, 40, 30];
      } else if (propertyKey === "performanceTrack") {
        tableData = filteredJanitors.flatMap((janitor) =>
          (janitor.performanceTrack || []).map((entry) => [
            janitor.basicDetails.name || "Unknown",
            formatHours(entry.today) || "0 hours",
            formatHours(entry.thisWeek) || "0 hours",
            formatHours(entry.thisMonth) || "0 hours",
            formatHours(entry.thisYear) || "0 hours",
            formatHours(entry.maxCleaningHour) || "0 hours",
            formatHours(entry.minCleaningHour) || "0 hours",
            entry.status || "N/A",
          ])
        );
        headers = [
          "Name",
          "Today",
          "This Week",
          "This Month",
          "This Year",
          "Max Hours",
          "Min Hours",
          "Status",
        ];
        columnWidths = [50, 40, 40, 40, 40, 40, 40, 30];
      } else if (propertyKey === "resourceUsage") {
        tableData = filteredJanitors
          .flatMap((janitor) =>
            (janitor.resourceUsage || [])
              .filter((entry) => {
                const amountUsed = entry.amountUsed || "0 ml";
                const amountValue = parseFloat(amountUsed.replace(" ml", "")) || 0;
                return amountValue > 1;
              })
              .map((entry) => [
                entry.name || "Unknown",
                entry.resource || "N/A",
                entry.amountUsed || "N/A",
                entry.recommended || "N/A",
                entry.remaining || "N/A",
                entry.restocked ? "Yes" : "No",
                entry.note || "N/A",
              ])
          )
          .sort((a, b) => {
            const nameA = a[0] || "Unknown";
            const nameB = b[0] || "Unknown";
            const resourceOrder = [
              "Chlorox",
              "Multipurpose Cleaner",
              "Toilet Bowl Cleaner",
              "Glass and Mirror Cleaner",
            ];
            if (nameA !== nameB) {
              return nameA.localeCompare(nameB);
            }
            const resourceA = a[1] || "";
            const resourceB = b[1] || "";
            return (
              resourceOrder.indexOf(resourceA) - resourceOrder.indexOf(resourceB)
            );
          });
        headers = [
          "Name",
          "Resource",
          "Amount Used",
          "Recommended",
          "Remaining",
          "Restocked",
          "Note",
        ];
        columnWidths = [50, 50, 40, 40, 40, 30, 40];
      } else if (propertyKey === "logsReport") {
        tableData = filteredJanitors
          .flatMap((janitor) =>
            (janitor.logsReport || []).map((entry) => [
              janitor.basicDetails.name || "Unknown",
              entry.date || "N/A",
              formatCleaningHour(entry.startTime, false) || "N/A",
              formatCleaningHour(entry.endTime, false) || "N/A",
              formatDuration(entry.duration) || "N/A",
              entry.task || "N/A",
              entry.status || "N/A",
            ])
          )
          .sort((a, b) => {
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
            return parseDate(b[1]).getTime() - parseDate(a[1]).getTime();
          });
        headers = [
          "Name",
          "Date",
          "Start Time",
          "End Time",
          "Cleaning Duration",
          "Task",
          "Status",
        ];
        columnWidths = [50, 40, 40, 40, 40, 40, 30];
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const totalEntries = tableData.length;
      doc.text(`Total Entries: ${totalEntries}`, margin, y);
      y += 10;

      let totalTableWidth = columnWidths.reduce((a, b) => a + b, 0);
      // Scale table width if it exceeds page width
      if (totalTableWidth > pageWidth - 2 * margin) {
        const scaleFactor = (pageWidth - 2 * margin) / totalTableWidth;
        columnWidths = columnWidths.map((width) =>
          Math.floor(width * scaleFactor)
        );
        totalTableWidth = columnWidths.reduce((a, b) => a + b, 0);
      }
      // Center the table horizontally
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
      let currentX = tableX + 2;
      headers.forEach((header, index) => {
        const truncatedHeader = truncateText(
          header,
          columnWidths[index],
          10,
          doc
        );
        doc.text(truncatedHeader, currentX, headerY + 5.5);
        currentX += columnWidths[index];
      });
      y += rowHeight;

      for (const [index, row] of tableData.entries()) {
        if (index % 2 === 0) {
          doc.setFillColor(245, 245, 245);
        } else {
          doc.setFillColor(255, 255, 255);
        }
        doc.rect(tableX, y, totalTableWidth, rowHeight, "F");

        currentX = tableX + 2;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        row.forEach((data, colIndex) => {
          const truncatedData = truncateText(
            data,
            columnWidths[colIndex],
            9,
            doc
          );
          doc.text(truncatedData, currentX, y + 5.5);
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
            const truncatedHeader = truncateText(
              header,
              columnWidths[index],
              10,
              doc
            );
            doc.text(truncatedHeader, currentX, y + 5.5);
            currentX += columnWidths[index];
          });
          y += rowHeight;
        }
      }

      await addWatermark();

      const pdfBlob = doc.output("blob");
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(pdfUrl);
      printWindow.onload = () => {
        printWindow.print();
        printWindow.onafterprint = () => {
          printWindow.close();
          URL.revokeObjectURL(pdfUrl);
        };
      };
    } catch (error) {
      console.error("Error in generatePDF:", error);
    }
  };

  const table = useReactTable({
    data: currentItems,
    columns: getActiveColumns(),
    getCoreRowModel: getCoreRowModel(),
  });

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <Card className="flex flex-col p-4 h-full bg-white shadow-md rounded-lg overflow-hidden">
      <div className="flex flex-row justify-between items-center shrink-0">
        <div className="relative w-96">
          <Input
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={handleSearch}
            className="pl-10 pr-4"
          />
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="default"
            className="bg-Icpetgreen hover:bg-Icpetgreen/90"
            onClick={handleGenerateSchedule}
          >
            Generate Schedule
          </Button>
          <Button variant="outline" size="icon" onClick={generatePDF}>
            <Printer className="w-5 h-5 text-Icpetgreen" />
          </Button>
        </div>
      </div>

      {/* Modal for Assigning Schedule */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px] bg-white rounded-lg shadow-xl">
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="text-2xl font-semibold text-gray-800">
              Assign Schedule
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-6">
            <div className="grid grid-cols-4 items-center gap-4">
              <label
                htmlFor="janitorId"
                className="text-right font-medium text-gray-700"
              >
                Janitor
              </label>
              <select
                id="janitorId"
                name="janitorId"
                value={scheduleForm.janitorId}
                onChange={handleFormChange}
                className="col-span-3 border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-Icpetgreen focus:border-Icpetgreen transition duration-200"
              >
                <option value="">Select a janitor</option>
                {janitorsData.map((janitor) => (
                  <option key={janitor._id} value={janitor._id}>
                    {janitor.basicDetails?.name || "Unknown"}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label
                htmlFor="date"
                className="text-right font-medium text-gray-700"
              >
                Date
              </label>
              <input
                type="date"
                id="date"
                name="date"
                value={scheduleForm.date}
                onChange={handleFormChange}
                className="col-span-3 border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-Icpetgreen focus:border-Icpetgreen transition duration-200"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label
                htmlFor="timeIn"
                className="text-right font-medium text-gray-700"
              >
                Time In
              </label>
              <input
                type="time"
                id="timeIn"
                name="timeIn"
                value={scheduleForm.timeIn}
                onChange={handleFormChange}
                className="col-span-3 border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-Icpetgreen focus:border-Icpetgreen transition duration-200"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label
                htmlFor="timeOut"
                className="text-right font-medium text-gray-700"
              >
                Time Out
              </label>
              <input
                type="time"
                id="timeOut"
                name="timeOut"
                value={scheduleForm.timeOut}
                onChange={handleFormChange}
                className="col-span-3 border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-Icpetgreen focus:border-Icpetgreen transition duration-200"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label
                htmlFor="task"
                className="text-right font-medium text-gray-700"
              >
                Task
              </label>
              <select
                id="task"
                name="task"
                value={scheduleForm.task}
                onChange={handleFormChange}
                className="col-span-3 border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-Icpetgreen focus:border-Icpetgreen transition duration-200"
              >
                <option value="Cleaning Restroom">Cleaning Restroom</option>
                <option value="Resource Restock">Resource Restock</option>
              </select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label
                htmlFor="shift"
                className="text-right font-medium text-gray-700"
              >
                Shift
              </label>
              <select
                id="shift"
                name="shift"
                value={scheduleForm.shift}
                onChange={handleFormChange}
                className="col-span-3 border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-Icpetgreen focus:border-Icpetgreen transition duration-200"
              >
                <option value="Morning">Morning</option>
                <option value="Afternoon">Afternoon</option>
                <option value="Evening">Evening</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t pt-4">
            <Button
              variant="outline"
              onClick={handleModalClose}
              className="border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </Button>
            <Button
              className="bg-Icpetgreen hover:bg-Icpetgreen/90 text-white"
              onClick={handleScheduleSubmit}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mt-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-transparent gap-6">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className={cn(
                  "rounded-lg data-[state=active]:shadow-none",
                  "data-[state=active]:bg-Icpetgreen data-[state=active]:text-white",
                  "data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-500",
                  "hover:text-gray-700 hover:bg-gray-50",
                  "transition-colors duration-200 ease-in-out"
                )}
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-hidden shadow-md rounded-lg border border-gray-200 mt-4">
        <div className="flex flex-col h-full">
          <div className="border-b shrink-0">
            <Table>
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

          <div className="flex-1 overflow-auto">
            <Table>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={getActiveColumns().length}
                      className="h-24"
                    >
                      <div className="flex justify-center items-center h-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : table.getRowModel().rows?.length ? (
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
                      colSpan={getActiveColumns().length}
                      className="h-24 text-center"
                    >
                      {activeTab === "Basic Details"
                        ? "No janitors found."
                        : "No results."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="border-t border-gray-200 bg-white p-2">
            {totalItems > itemsPerPage && (
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={handlePrevPage}
                      className={cn(
                        "cursor-pointer",
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
                          "cursor-pointer",
                          currentPage === page &&
                            "bg-Icpetgreen text-white hover:bg-Icpetgreen/90"
                        )}
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}

                  {totalPages > 7 && currentPage < totalPages - 3 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}

                  <PaginationItem>
                    <PaginationNext
                      onClick={handleNextPage}
                      className={cn(
                        "cursor-pointer Ministers",
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
      </div>
    </Card>
  );
}