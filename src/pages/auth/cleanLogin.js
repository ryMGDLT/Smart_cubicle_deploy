import React, { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import Swal from "sweetalert2";
import axios from "axios";

export default function CleanLogin() {
  const [task, setTask] = useState("");
  const [cleaningStatus, setCleaningStatus] = useState("");
  const [employeeId, setEmployeeId] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!task || !cleaningStatus || !employeeId) {
      Swal.fire({
        icon: "warning",
        title: "Missing Fields",
        text: "Please select a task, cleaning status, and enter your Employee ID.",
      });
      return;
    }

    try {
      const backendPort = process.env.REACT_APP_BACKEND_PORT || "5000";
      const apiUrl =
        process.env.NODE_ENV === "development"
          ? `http://localhost:${backendPort}/api/cleaning-entries/submit`
          : `${process.env.REACT_APP_API_URL}/api/cleaning-entries/submit`;

      console.log("Submitting to API:", apiUrl);
      console.log("Payload:", { employeeId: employeeId.trim(), task, cleaningStatus });

      const response = await axios.post(apiUrl, {
        employeeId: employeeId.trim(),
        task,
        cleaningStatus,
      });

      Swal.fire({
        icon: "success",
        title: "Success",
        text: response.data.message,
      });
      setTask("");
      setCleaningStatus("");
      setEmployeeId("");
    } catch (error) {
      console.error("Submission Error:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      Swal.fire({
        icon: "error",
        title: "Error",
        text:
          error.response?.data?.message ||
          error.message ||
          "Failed to submit task. Please check the console for details.",
      });
    }
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen p-4 overflow-hidden">
      <img
        src="/images/ICPET.png"
        alt="Background"
        className="absolute top-[-250px] left-[-580px] w-[150%] h-auto object-cover opacity-50 z-0"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#23897D] to-white opacity-90 z-10"></div>

      <div className="relative p-8 w-full max-w-md z-20">
        <div className="flex justify-center mb-1 mt-[-60px]">
          <img
            src="/images/ICPET.png"
            alt="Logo"
            className="w-[250px] h-[250px] object-contain"
          />
        </div>
        <form className="mt-2" onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block font-bold text-Icpetgreen text-sm mb-2">
              Select Task:
            </label>
            <select
              value={task}
              onChange={(e) => setTask(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none bg-white"
              required
            >
              <option value="" disabled>
                Select a task
              </option>
              <option value="Clean Restroom">Clean Restroom</option>
              <option value="Resource Restock">Resource Restock</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block font-bold text-Icpetgreen text-sm mb-2">
              Cleaning Status:
            </label>
            <select
              value={cleaningStatus}
              onChange={(e) => setCleaningStatus(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none bg-white"
              required
            >
              <option value="" disabled>
                Select cleaning status
              </option>
              <option value="Start Cleaning">Start Cleaning</option>
              <option value="End Cleaning">End Cleaning</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block font-bold text-Icpetgreen text-sm mb-2">
              Employee ID:
            </label>
            <Input
              type="text"
              placeholder="Enter your Employee ID"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none bg-white"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
            />
          </div>

          <Button
            type="submit"
            className="w-1/2 mx-auto block"
            variant="default"
          >
            Submit
          </Button>
        </form>
      </div>
    </div>
  );
}