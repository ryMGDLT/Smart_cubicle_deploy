// src/utils/odorCalculations.js
import { DateTime } from 'luxon';

export function calculateHourlyAverages(rawDocuments) {
  // Initialize all hours (6 AM to 7 PM)
  const allHours = Array.from({ length: 14 }, (_, i) => {
    const hour = 6 + i;
    const formattedHour = DateTime.fromObject(
      { hour },
      { zone: 'Asia/Manila' }
    ).toFormat('h:mm a');
    return {
      timeStamp: formattedHour,
      odor: { value: 0, status: 'Unknown', color: 'text-gray-600' },
      temperature: { value: 0, status: 'Unknown', color: 'text-gray-600' },
      capacity: { value: 'N/A', status: 'Unknown', color: 'text-gray-600' },
      actionRequired: 'None',
    };
  });

  // Group documents by hour
  const hourlyData = {};

  rawDocuments.forEach((doc) => {
    // Parse timestamp in Asia/Manila
    const dt = DateTime.fromISO(doc.timestamp, { zone: 'Asia/Manila' });
    if (!dt.isValid) return;

    const hour = dt.hour;
    if (hour < 6 || hour > 19) return; // Only 6 AM to 7 PM

    if (!hourlyData[hour]) {
      hourlyData[hour] = [];
    }
    hourlyData[hour].push(doc);
  });

  // Calculate averages for each hour
  Object.keys(hourlyData).forEach((hour) => {
    const docs = hourlyData[hour];
    const hourNum = parseInt(hour);
    const formattedHour = DateTime.fromObject(
      { hour: hourNum },
      { zone: 'Asia/Manila' }
    ).toFormat('h:mm a');

    // Calculate avgAQI
    const aqiAverages = docs.map((doc) => {
      const { GAS1, GAS2, GAS3, GAS4 } = doc.aqi;
      return (GAS1 + GAS2 + GAS3 + GAS4) / 4;
    });
    const avgAQI = aqiAverages.length
      ? Number((aqiAverages.reduce((sum, val) => sum + val, 0) / aqiAverages.length).toFixed(2))
      : 0;

    // Calculate avgTemp (convert Celsius to Fahrenheit)
    const tempAverages = docs.map((doc) => {
      const { TEMP1, TEMP2, TEMP3, TEMP4 } = doc.dht;
      return (TEMP1.temp + TEMP2.temp + TEMP3.temp + TEMP4.temp) / 4;
    });
    const avgTempC = tempAverages.length
      ? tempAverages.reduce((sum, val) => sum + val, 0) / tempAverages.length
      : 0;
    const avgTemp = avgTempC ? Number((avgTempC * 1.8 + 32).toFixed(2)) : 0;

    // Odor status and color
    const odorStatus =
      avgAQI === 0 || avgAQI <= 150
        ? 'Normal'
        : avgAQI <= 300
        ? 'Moderate'
        : 'Severe';
    const odorColor =
      avgAQI === 0 || avgAQI <= 150
        ? 'text-green-600'
        : avgAQI <= 300
        ? 'text-yellow-600'
        : 'text-red-600';

    // Temp status and color (based on Fahrenheit)
    const tempStatus =
      avgTemp === 0 || (avgTemp >= 68 && avgTemp <= 78)
        ? 'Normal'
        : avgTemp >= 79 && avgTemp <= 89
        ? 'Moderate'
        : 'Severe';
    const tempColor =
      avgTemp === 0 || (avgTemp >= 68 && avgTemp <= 78)
        ? 'text-green-600'
        : avgTemp >= 79 && avgTemp <= 89
        ? 'text-yellow-600'
        : 'text-red-600';

    hourlyData[hour] = {
      timeStamp: formattedHour,
      odor: { value: avgAQI, status: odorStatus, color: odorColor },
      temperature: { value: avgTemp, status: tempStatus, color: tempColor },
      capacity: { value: 'N/A', status: 'Unknown', color: 'text-gray-600' },
      actionRequired: avgAQI > 300 || avgTemp > 89 ? 'Inspect' : 'None',
    };
  });

  // Merge with all hours
  return allHours.map((defaultHour) => {
    const hourNum = DateTime.fromFormat(defaultHour.timeStamp, 'h:mm a', {
      zone: 'Asia/Manila',
    }).hour;
    return hourlyData[hourNum] || defaultHour;
  });
}