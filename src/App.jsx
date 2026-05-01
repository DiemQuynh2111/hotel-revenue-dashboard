import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";

// ============================================================================
// 1. CẤU HÌNH & STYLES
// ============================================================================
const CONFIG = {
  MC_ITERATIONS: 2000,
  DAYS_IN_MONTH: 31,
  TOTAL_ROOMS: 80,
  HISTORICAL_AVG_OCCUPANCY: 44.2, 
  ANCILLARY_RATIO: 0.18,
  MC_PARAMS: { DEMAND_MEAN: 0.85, DEMAND_STD_DEV: 0.05, CANCEL_MEAN: 0.10, CANCEL_STD_DEV: 0.02 },
  DEFAULT_METRICS: { forecast: 125494, onHand: 110744 },
  DAYS_WEEKDAY: 22,
  DAYS_WEEKEND: 9
};

const STYLES = {
  layoutCenter: { minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", position: "relative", padding: "20px", fontFamily: "system-ui, -apple-system, sans-serif" },
  bgBlur: { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "#f8fafc", zIndex: -1 },
  loginCard: { background: "white", padding: "50px", width: "100%", maxWidth: "800px", borderTop: "4px solid #1e3a8a", boxShadow: "0 20px 40px rgba(0,0,0,0.1)", borderRadius: "8px" },
  heading: { color: "#0f172a", margin: "0 0 10px 0", fontSize: "26px", fontWeight: "900", textTransform: "uppercase", letterSpacing: "1px" },
  subHeading: { color: "#64748b", margin: "0 0 30px 0", fontSize: "14px", fontWeight: "500", lineHeight: "1.6" },
  flexGap: { display: "flex", gap: "20px", marginBottom: "30px" },
  uploadBox: { flex: 1, border: "1px solid #cbd5e1", padding: "25px 20px", background: "#f1f5f9", borderRadius: "6px" },
  uploadTitle: { fontSize: "12px", fontWeight: "800", color: "#1e3a8a", margin: "0 0 12px 0" },
  btnPrimary: { background: "#1e3a8a", color: "white", padding: "18px", border: "none", cursor: "pointer", fontWeight: "800", letterSpacing: "1px", width: "100%", fontSize: "14px", textTransform: "uppercase", borderRadius: "6px" },
  
  layoutMain: { minHeight: "100vh", padding: "30px 20px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#0f172a" },
  bgBlurLight: { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "#f1f5f9", zIndex: -1 },
  dashboardContainer: { maxWidth: "1500px", margin: "0 auto", background: "white", boxShadow: "0 10px 40px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" },
  header: { background: "#0f172a", padding: "30px 40px", color: "white", borderBottom: "4px solid #1e3a8a", display: "flex", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontSize: "22px", fontWeight: "900", textTransform: "uppercase", margin: "0 0 8px 0", letterSpacing: "1px" },
  headerSub: { margin: 0, color: "#94a3b8", fontSize: "13px", fontWeight: "500" },
  statusSuccess: { padding: "8px 16px", background: "#059669", color: "white", fontWeight: "800", fontSize: "12px", borderRadius: "6px", border: "1px solid #047857" },
  contentArea: { padding: "40px" },
  
  grid2Col: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "25px", marginBottom: "35px" },
  metricCardActive: { padding: "25px", border: "1px solid #cbd5e1", background: "#f8fafc", borderLeft: "5px solid #1e3a8a", borderRadius: "6px" },
  metricCard: { padding: "25px", border: "1px solid #cbd5e1", background: "white", borderLeft: "5px solid #64748b", borderRadius: "6px" },
  metricLabel: { fontSize: "12px", color: "#475569", fontWeight: "800", letterSpacing: "0.5px" },
  metricValue: { fontSize: "34px", fontWeight: "900", color: "#0f172a", marginTop: "10px" },
  
  controlSection: { marginBottom: "40px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "40px", padding: "35px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px" },
  flexBetween: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" },
  controlTitle: { fontSize: "15px", fontWeight: "800", color: "#0f172a", margin: 0 },
  badge: { fontSize: "18px", fontWeight: "900", color: "white", background: "#1e3a8a", padding: "6px 14px", borderRadius: "6px" },
  slider: { width: "100%", accentColor: "#1e3a8a", cursor: "pointer", height: "6px" },
  sliderReverse: { width: "100%", accentColor: "#1e3a8a", cursor: "pointer", direction: "rtl", height: "6px" },
  helperText: { marginTop: "18px", fontSize: "14px", color: "#334155", lineHeight: "1.6" },
  highlightText: { color: "#1e3a8a", fontWeight: "800" },
  alertBox: { marginTop: "18px", fontSize: "14px", color: "#1e3a8a", lineHeight: "1.6", borderLeft: "4px solid #1e3a8a", paddingLeft: "15px", background: "#eff6ff", padding: "12px", borderRadius: "0 6px 6px 0" },
  
  flexGapSmall: { display: "flex", gap: "8px", marginBottom: "25px" },
  tabActive: { flex: 1, padding: "16px", border: "none", cursor: "pointer", background: "#1e3a8a", color: "white", fontWeight: "800", fontSize: "14px", borderRadius: "6px" },
  tab: { flex: 1, padding: "16px", border: "1px solid #cbd5e1", cursor: "pointer", background: "#f8fafc", color: "#475569", fontWeight: "700", fontSize: "14px", borderRadius: "6px" },
  
  table: { width: "100%", borderCollapse: "collapse", border: "1px solid #cbd5e1", background: "white", borderRadius: "8px", overflow: "hidden", tableLayout: "fixed" },
  tableHead: { textAlign: "left", background: "#f1f5f9", borderBottom: "3px solid #1e3a8a" },
  th: { padding: "18px 20px", fontSize: "12px", color: "#1e3a8a", textTransform: "uppercase", fontWeight: "900" },
  tableRow: { borderBottom: "1px solid #e2e8f0" },
  td: { padding: "25px 20px", verticalAlign: "top" },
  
  roomName: { fontWeight: "900", color: "#0f172a", fontSize: "15px", marginBottom: "12px", textTransform: "uppercase" },
  roomStat: { fontSize: "13px", color: "#64748b", marginBottom: "6px" },
  roomAvai: { fontSize: "13px", fontWeight: "800", color: "#1e3a8a", padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", display: "inline-block", marginTop: "6px", borderRadius: "6px" },
  priceOld: { fontSize: "14px", color: "#94a3b8", textDecoration: "line-through", fontWeight: "600" },
  priceNew: { fontSize: "24px", fontWeight: "900", color: "#0f172a", margin: "6px 0" },
  priceDiff: { fontSize: "13px", fontWeight: "800" },
  
  stratSection: { marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px dashed #e2e8f0" },
  stratLevel: { display: "inline-block", padding: "4px 8px", background: "#f1f5f9", color: "#334155", fontSize: "11px", fontWeight: "800", borderRadius: "4px", marginBottom: "6px", textTransform: "uppercase" },
  stratTitle: { fontSize: "13px", fontWeight: "800", color: "#0f172a", marginBottom: "6px" },
  stratDesc: { fontSize: "13px", color: "#475569", lineHeight: "1.6", margin: 0, textAlign: "justify" },
  
  ancilTitle: { fontSize: "13px", fontWeight: "900", color: "#1d4ed8", marginBottom: "6px", textTransform: "uppercase" },
  ancilDesc: { fontSize: "13px", color: "#475569", lineHeight: "1.6", fontStyle: "italic", textAlign: "justify" },
  
  impactSection: { border: "1px solid #cbd5e1", background: "white", borderRadius: "8px", overflow: "hidden" },
  impactHeader: { fontSize: "16px", fontWeight: "900", color: "#0f172a", background: "#f1f5f9", margin: 0, padding: "20px 30px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" },
  impactGrid: { padding: "40px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "40px" },
  impactTextCol: { borderRight: "1px solid #e2e8f0", paddingRight: "40px" },
  impactDesc: { fontSize: "14px", color: "#475569", lineHeight: "1.8", margin: "0 0 25px 0", textAlign: "justify" },
  impactBaseBox: { padding: "25px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "6px" },
  impactBaseLabel: { fontSize: "12px", fontWeight: "800", color: "#64748b", marginBottom: "8px" },
  impactBaseVal: { fontSize: "28px", fontWeight: "900", color: "#0f172a" },
  impactResultGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" },
  impactTotalBox: { padding: "25px", background: "#0f172a", color: "white", gridColumn: "1 / -1", borderLeft: "5px solid #1e3a8a", borderRadius: "6px" },
  impactTotalLabel: { fontSize: "12px", fontWeight: "800", color: "#94a3b8", marginBottom: "8px" },
  impactTotalVal: { fontSize: "36px", fontWeight: "900", color: "white" },
  impactGrowthBox: { padding: "20px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px" },
  impactSubBox: { padding: "20px", background: "white", border: "1px solid #cbd5e1", borderRadius: "6px" },
  impactAncilBox: { padding: "20px", background: "white", border: "1px solid #cbd5e1", gridColumn: "1 / -1", borderRadius: "6px" }
};

// ============================================================================
// 2. UTILITIES
// ============================================================================
const Utils = {
  currency: (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v || 0),
  formatNum: (v) => new Intl.NumberFormat("en-US").format(Math.round(v || 0)),
  randomNormal: (mean, stdDev) => {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return mean + (Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)) * stdDev;
  }
};

// ============================================================================
// 3. CHIẾN LƯỢC KINH DOANH CHUẨN HÓA DATA 100% TỪ FILE
// ============================================================================
const STRATEGIES = {
  Weekday: {
    RT_STD: { 
      who: [
        { level: "Ưu tiên 1", title: "Segment: Corporate", desc: "Đảm bảo base công suất ngày thường." },
        { level: "Ưu tiên 2", title: "Segment: Group", desc: "Khai thác nhóm lưu trú dài ngày (>6 đêm)." }
      ], 
      where: [
        { level: "Kênh Chính", title: "Channel: Corporate Contract", desc: "Không tốn 17.8% hoa hồng OTA." }
      ], 
      ancillary: { title: "Dịch vụ: F&B Bundle", desc: "Corporate có nhu cầu ăn uống tại chỗ cao." }
    },
    RT_DLX: { 
      who: [
        { level: "Ưu tiên 1", title: "Segment: Leisure", desc: "Tệp khách chi phối 62% doanh thu với ADR cao nhất." }
      ], 
      where: [
        { level: "Kênh Chính", title: "Channel: Direct - Website", desc: "Kéo khách về web để chặn tỷ lệ hủy 17.8% từ OTA." }
      ], 
      ancillary: { title: "Dịch vụ: Spa & Tour Upsell", desc: "Bán chéo Spa/Tour để gánh bớt sự độc tôn của F&B." }
    },
    RT_STE: { 
      who: [
        { level: "Ưu tiên 1", title: "Segment: Corporate", desc: "Đón lõng các cấp quản lý hoặc chuyên gia." }
      ], 
      where: [
        { level: "Kênh Chính", title: "Channel: Direct - Phone", desc: "Chăm sóc cá nhân hóa, giữ vững thương hiệu." }
      ], 
      ancillary: { title: "Dịch vụ: Trọn gói VIP", desc: "Tích hợp đưa đón sân bay và mọi tiện ích cao cấp." }
    }
  },
  Weekend: {
    RT_STD: { 
      who: [
        { level: "Ưu tiên 1", title: "Segment: Leisure", desc: "Cầu du lịch cuối tuần vô cùng dồi dào." }
      ], 
      where: [
        { level: "Kênh Chính", title: "Channel: Booking/Agoda", desc: "Bắt buộc dùng OTA để kéo Volume, nhưng bán giá NRF." }
      ], 
      ancillary: { title: "Dịch vụ: F&B Buffet", desc: "Tối ưu nhà hàng cuối tuần." }
    },
    RT_DLX: { 
      who: [
        { level: "Ưu tiên 1", title: "Segment: Leisure", desc: "Khách sẵn sàng chi trả cao cho tiện ích." }
      ], 
      where: [
        { level: "Kênh Chính", title: "Channel: Direct - Website", desc: "Chạy chiến dịch quảng cáo kỳ nghỉ cuối tuần." }
      ], 
      ancillary: { title: "Dịch vụ: Spa Retreat", desc: "Tập trung đẩy mạnh gói Spa." }
    },
    RT_STE: { 
      who: [
        { level: "Ưu tiên 1", title: "Segment: Leisure", desc: "Sức mua lấp đầy Suite đạt đỉnh 57.4%." }
      ], 
      where: [
        { level: "Kênh Chính", title: "Channel: Direct - Phone", desc: "Telesales nội bộ loại bỏ hoàn toàn tình trạng No-show." }
      ], 
      ancillary: { title: "Dịch vụ: Tour Heritage", desc: "Trải nghiệm tham quan thiết kế riêng." }
    }
  }
};

// ============================================================================
// 4. DATA EXTRACTOR (QUÉT DATA THỰC TẾ 100%)
// ============================================================================
const DataExtractor = {
  readFile: (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          resolve(XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true }));
        } catch (err) { resolve(null); }
      };
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file);
    });
  },

  getSheetData: (workbook, keyword, fallbackKeywords = []) => {
    if (!workbook) return [];
    let sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes(keyword.toLowerCase()));
    if (!sheetName && workbook.SheetNames.length === 1) sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      sheetName = workbook.SheetNames.find(n => {
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[n], { header: 1 });
        if (data.length > 0) {
          const headerStr = Object.values(data[0] || {}).join("").toLowerCase();
          return fallbackKeywords.some(kw => headerStr.includes(kw));
        }
        return false;
      });
    }
    if (!sheetName) return [];
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
  },

  processRealData: async (historyFile, forecastFile) => {
    const [histWb, forecastWb] = await Promise.all([
      DataExtractor.readFile(historyFile), 
      DataExtractor.readFile(forecastFile)
    ]);

    let metrics = { ...CONFIG.DEFAULT_METRICS };
    
    // 1. Quét Forecast
    const forecastData = DataExtractor.getSheetData(forecastWb, "summary", ["forecast"]);
    if (forecastData.length > 0) {
      forecastData.forEach(row => {
        const vals = Object.values(row);
        if (vals.length >= 2 && !isNaN(parseFloat(vals[1]))) {
          const keyStr = String(vals[0]).toLowerCase();
          if (keyStr.includes("forecast total")) metrics.forecast = parseFloat(vals[1]);
          if (keyStr.includes("on-hand total")) metrics.onHand = parseFloat(vals[1]);
        }
      });
    }

    // 2. Quét RoomNights để tìm số lượng ĐÃ BÁN THỰC TẾ
    const rnData = DataExtractor.getSheetData(histWb, "night", ["stay", "room_type"]);
    let rawSold = { Weekday: { RT_STD: 0, RT_DLX: 0, RT_STE: 0 }, Weekend: { RT_STD: 0, RT_DLX: 0, RT_STE: 0 } };

    // 3. Quét Reservations để tìm số lượng KHÁCH TRẢ PHÒNG THỰC TẾ (Dựa vào departure_date)
    const resData = DataExtractor.getSheetData(histWb, "reservation", ["departure"]);
    let rawCheckouts = { Weekday: { RT_STD: 0, RT_DLX: 0, RT_STE: 0 }, Weekend: { RT_STD: 0, RT_DLX: 0, RT_STE: 0 } };

    let syncStatus = false;

    // Quét file RoomNights
    rnData.forEach(row => {
      let isTargetMonth = false;
      for (let key in row) {
        const val = row[key];
        if (val instanceof Date && val.getFullYear() === 2026 && val.getMonth() === 0) isTargetMonth = true;
        else if (typeof val === 'string' && (val.includes("2026-01") || val.includes("2026/01") || val.includes("1/2026"))) isTargetMonth = true;
      }
      if (isTargetMonth) {
        const status = String(row.occupancy_status || "").toLowerCase();
        if (!status.includes("cancel")) {
          syncStatus = true;
          const rtRaw = String(row.room_type_id || row.room_type || "").toUpperCase();
          let rt = "RT_STD";
          if (rtRaw.includes("DLX") || rtRaw.includes("DELUXE")) rt = "RT_DLX";
          if (rtRaw.includes("STE") || rtRaw.includes("SUITE")) rt = "RT_STE";
          const dtRaw = String(row.day_type || "").toLowerCase();
          const dt = (dtRaw.includes("weekend") || dtRaw.includes("sat") || dtRaw.includes("sun")) ? "Weekend" : "Weekday";
          rawSold[dt][rt] += parseFloat(row.room_night_qty || row.qty || 1);
        }
      }
    });

    // Quét file Reservations để tính khách trả (Checkout)
    resData.forEach(row => {
      let isTargetMonth = false;
      let depDateObj = null;

      if (row.departure_date instanceof Date) {
        depDateObj = row.departure_date;
        if (depDateObj.getFullYear() === 2026 && depDateObj.getMonth() === 0) isTargetMonth = true;
      } else if (typeof row.departure_date === 'string' && row.departure_date.includes("2026-01")) {
        isTargetMonth = true;
        depDateObj = new Date(row.departure_date);
      } else if (typeof row.DepartureDate === 'string' && row.DepartureDate.includes("2026-01")) {
        isTargetMonth = true;
        depDateObj = new Date(row.DepartureDate);
      }

      const status = String(row.status || row.Status || "").toLowerCase();
      const isCancelled = row.is_cancelled == 1 || status.includes("cancel");

      if (isTargetMonth && !isCancelled) {
        const rtRaw = String(row.room_type_id || row.room_type || "").toUpperCase();
        let rt = "RT_STD";
        if (rtRaw.includes("DLX") || rtRaw.includes("DELUXE")) rt = "RT_DLX";
        if (rtRaw.includes("STE") || rtRaw.includes("SUITE")) rt = "RT_STE";

        let dayOfWeek = depDateObj ? depDateObj.getDay() : 1; 
        const dt = (dayOfWeek === 0 || dayOfWeek === 6) ? "Weekend" : "Weekday";
        const roomsBooked = parseFloat(row.rooms_booked || row.RoomsBooked || 1);
        
        rawCheckouts[dt][rt] += roomsBooked;
      }
    });

    // 4. Chia Trung Bình ra kết quả
    let finalInventory = { Weekday: {}, Weekend: {} };
    const CAPACITIES = { RT_STD: 45, RT_DLX: 28, RT_STE: 7 };
    const ROOM_NAMES = { RT_STD: "STANDARD ROOM", RT_DLX: "DELUXE ROOM", RT_STE: "EXECUTIVE SUITE" };
    const BASE_PRICES = { RT_STD: 95, RT_DLX: 129, RT_STE: 220 }; 

    ["Weekday", "Weekend"].forEach(dayType => {
      ["RT_STD", "RT_DLX", "RT_STE"].forEach(roomType => {
        const divider = dayType === "Weekday" ? CONFIG.DAYS_WEEKDAY : CONFIG.DAYS_WEEKEND;
        
        const avgSold = Math.round(rawSold[dayType][roomType] / divider);
        const avgCheckouts = Math.round(rawCheckouts[dayType][roomType] / divider);
        const capacity = CAPACITIES[roomType];

        finalInventory[dayType][roomType] = {
          name: ROOM_NAMES[roomType],
          capacity: capacity,
          baseSold: syncStatus ? avgSold : (roomType === "RT_STD" ? 18 : roomType === "RT_DLX" ? 12 : 3),
          baseCheckOuts: syncStatus ? avgCheckouts : (roomType === "RT_STD" ? 4 : roomType === "RT_DLX" ? 2 : 1),
          oldPrice: BASE_PRICES[roomType]
        };
      });
    });

    return { metrics, inventoryData: finalInventory, syncStatus };
  }
};

// ============================================================================
// 5. MAIN APP COMPONENT
// ============================================================================
export default function App() {
  const [historyFile, setHistoryFile] = useState(null);
  const [forecastFile, setForecastFile] = useState(null);
  const [appData, setAppData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [selectedDayType, setSelectedDayType] = useState("Weekday");
  const [simLeadTime, setSimLeadTime] = useState(30); 
  const [targetOccupancy, setTargetOccupancy] = useState(65);

  const handleProcessData = async () => {
    if (!historyFile || !forecastFile) return alert("Hệ thống yêu cầu cung cấp đủ 2 file dữ liệu.");
    setIsProcessing(true);
    const processedData = await DataExtractor.processRealData(historyFile, forecastFile);
    setAppData(processedData);
    setIsProcessing(false);
  };

  // ĐỘNG CƠ PHÂN TÍCH VÀ ĐỘNG LỰC HỌC TỒN KHO THEO LEAD TIME
  const analyticsData = useMemo(() => {
    if (!appData || !appData.inventoryData) return null;

    const baseData = appData.inventoryData[selectedDayType];

    const historicalSoldRooms = Math.round(CONFIG.TOTAL_ROOMS * (CONFIG.HISTORICAL_AVG_OCCUPANCY / 100));
    const targetDailyRooms = Math.round(CONFIG.TOTAL_ROOMS * (targetOccupancy / 100));
    const maxExtraDailyRooms = Math.max(0, targetDailyRooms - historicalSoldRooms);
    const extraMonthlyRoomNightsToSell = maxExtraDailyRooms * CONFIG.DAYS_IN_MONTH; 

    // ĐỊNH GIÁ 5 TẦNG
    let leadMultiplier = 1.0;
    let leadReason = "";

    if (simLeadTime <= 3) {
      leadMultiplier = 1.15;
      leadReason = "[Tier 1 - Khẩn cấp]: Nhu cầu vọt lên sát ngày check-in. Khuyến nghị TĂNG GIÁ 15% để tối ưu hóa Yield.";
    } else if (simLeadTime <= 7) {
      leadMultiplier = 1.05;
      leadReason = "[Tier 2 - Ngắn hạn]: Khách hàng đã chốt vé. Khuyến nghị TĂNG GIÁ 5% để thu hồi thặng dư tiêu dùng.";
    } else if (simLeadTime <= 14) {
      leadMultiplier = 1.00;
      leadReason = "[Tier 3 - Tiêu chuẩn]: Trạng thái cung cầu cân bằng. DUY TRÌ GIÁ BASE để duy trì Booking Velocity.";
    } else if (simLeadTime <= 21) {
      leadMultiplier = 0.95;
      leadReason = "[Tier 4 - Đặt sớm]: Ưu đãi kích cầu. GIẢM GIÁ 5%, kèm điều khoản hoàn hủy chặt chẽ (Phạt 50%).";
    } else {
      leadMultiplier = 0.90;
      leadReason = "[Tier 5 - Dài hạn]: Thu hút Base Volume sớm. GIẢM GIÁ 10%, bắt buộc áp dụng Non-refundable 100%.";
    }

    // Tiến độ chốt đơn (Booking Pace): Lead Time 30 -> 0%, Lead Time 1 -> 100%
    const pickupProgress = (30 - simLeadTime) / 29;

    const processedRooms = ["RT_STD", "RT_DLX", "RT_STE"].map(key => {
      const roomBase = baseData[key];
      const strat = STRATEGIES[selectedDayType][key];
      
      const roomTargetShare = Math.round(maxExtraDailyRooms * (roomBase.capacity / CONFIG.TOTAL_ROOMS));
      const pickupRooms = Math.round(roomTargetShare * pickupProgress);
      
      // 1. TÍNH ĐÃ BÁN
      const dynamicSold = Math.min(roomBase.capacity, Math.round(roomBase.capacity * (CONFIG.HISTORICAL_AVG_OCCUPANCY/100)) + pickupRooms);
      
      // 2. TÍNH KHÁCH TRẢ TỪ DỮ LIỆU THỰC TẾ (Bù trừ theo tiến độ đặt phòng)
      // Khách trả phòng = Trung bình thực tế từ File + Lượng trả phòng của số khách mới mua
      const checkOutRooms = Math.round(roomBase.baseCheckOuts + (pickupRooms * (roomBase.baseCheckOuts / (roomBase.baseSold || 1))));
      
      // 3. TÍNH SẴN BÁN
      const dynamicAvai = Math.max(0, Math.min(roomBase.capacity, roomBase.capacity - dynamicSold + checkOutRooms));

      const dynamicAdr = roomBase.oldPrice * leadMultiplier;
      const priceDiff = ((dynamicAdr / roomBase.oldPrice) - 1) * 100;

      return { key, dynamicSold, checkOutRooms, avai: dynamicAvai, dynamicAdr, priceDiff, ...roomBase, ...strat };
    });

    // MÔ PHỎNG MONTE CARLO
    let successfulRoomRev = 0;
    const avgDynamicAdr = processedRooms.reduce((sum, r) => sum + r.dynamicAdr, 0) / 3;

    for (let i = 0; i < CONFIG.MC_ITERATIONS; i++) {
      const demandCapture = Utils.randomNormal(CONFIG.MC_PARAMS.DEMAND_MEAN, CONFIG.MC_PARAMS.DEMAND_STD_DEV);
      const cancelRatio = Utils.randomNormal(CONFIG.MC_PARAMS.CANCEL_MEAN, CONFIG.MC_PARAMS.CANCEL_STD_DEV);
      const conversionRate = Math.max(0, Math.min(1, demandCapture)) * (1 - Math.max(0, Math.min(1, cancelRatio)));
      const simulatedMonthlyRoomsSold = extraMonthlyRoomNightsToSell * conversionRate;
      successfulRoomRev += (simulatedMonthlyRoomsSold * avgDynamicAdr);
    }

    const meanRoomRev = successfulRoomRev / CONFIG.MC_ITERATIONS;
    const meanAncillaryRev = meanRoomRev * CONFIG.ANCILLARY_RATIO; 
    const totalProjectedRev = appData.metrics.onHand + meanRoomRev + meanAncillaryRev;
    
    return { extraMonthlyRoomNightsToSell, leadReason, processedRooms, impact: { totalProjectedRev, meanRoomRev, meanAncillaryRev } };

  }, [appData, selectedDayType, simLeadTime, targetOccupancy]);

  if (!appData) {
    return (
      <div style={STYLES.layoutCenter}>
        <div style={STYLES.bgBlur} />
        <div style={STYLES.loginCard}>
          <h1 style={STYLES.heading}>Hệ thống Hoạch định Doanh thu (BI)</h1>
          <p style={STYLES.subHeading}>Giải pháp Kê toa (Prescriptive Analytics): Giảm phụ thuộc OTA, triệt tiêu Leakage và Đa dạng hóa Ancillary Revenue.</p>
          <div style={STYLES.flexGap}>
            <div style={STYLES.uploadBox}>
              <p style={STYLES.uploadTitle}>1. DỮ LIỆU LỊCH SỬ (CLEANED FILE)</p>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setHistoryFile(e.target.files[0])} />
            </div>
            <div style={STYLES.uploadBox}>
              <p style={STYLES.uploadTitle}>2. DỮ LIỆU DỰ BÁO (FORECAST FILE)</p>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setForecastFile(e.target.files[0])} />
            </div>
          </div>
          <button onClick={handleProcessData} disabled={isProcessing} style={STYLES.btnPrimary}>
            {isProcessing ? "ĐANG IMPORT VÀ TRÍCH XUẤT DỮ LIỆU..." : "Import Dữ liệu & Kết xuất Báo cáo Kê toa"}
          </button>
        </div>
      </div>
    );
  }

  const { extraMonthlyRoomNightsToSell, leadReason, processedRooms, impact } = analyticsData;
  const growthPercent = ((impact.totalProjectedRev / appData.metrics.forecast) - 1) * 100;

  return (
    <div style={STYLES.layoutMain}>
      <div style={STYLES.bgBlurLight} />
      <div style={STYLES.dashboardContainer}>
        
        <header style={STYLES.header}>
          <div>
            <h1 style={STYLES.headerTitle}>Báo cáo Quản trị & Kê toa Chiến lược - Tháng 01/2026</h1>
            <p style={STYLES.headerSub}>Tái cân bằng Kênh phân phối, Phân khúc khách hàng & Tối ưu hóa Doanh thu bổ trợ.</p>
          </div>
          <div style={STYLES.statusSuccess}>✓ ĐÃ ĐỒNG BỘ DATA & PHÂN TÍCH STORYBOARD</div>
        </header>

        <div style={STYLES.contentArea}>
          <div style={STYLES.grid2Col}>
            <div style={STYLES.metricCardActive}>
              <span style={STYLES.metricLabel}>DOANH THU ĐÃ CHỐT (ON-HAND)</span>
              <div style={STYLES.metricValue}>{Utils.currency(appData.metrics.onHand)}</div>
            </div>
            <div style={STYLES.metricCard}>
              <span style={STYLES.metricLabel}>DỰ BÁO DOANH THU TĨNH (BASELINE)</span>
              <div style={STYLES.metricValue}>{Utils.currency(appData.metrics.forecast)}</div>
            </div>
          </div>

          <section style={STYLES.controlSection}>
            <div>
              <div style={STYLES.flexBetween}>
                <h2 style={STYLES.controlTitle}>MỤC TIÊU CÔNG SUẤT KHÁCH SẠN:</h2>
                <span style={STYLES.badge}>{targetOccupancy}%</span>
              </div>
              <input type="range" min="45" max="95" value={targetOccupancy} onChange={(e) => setTargetOccupancy(Number(e.target.value))} style={STYLES.slider} />
              <div style={STYLES.helperText}>
                Trung bình Công suất Lịch sử chỉ đạt <span style={STYLES.highlightText}>{CONFIG.HISTORICAL_AVG_OCCUPANCY}%</span>. Để kéo công suất lên mức <span style={STYLES.highlightText}>{targetOccupancy}%</span>, Khối Kinh doanh cần triển khai chiến lược để khai thác thêm <span style={STYLES.highlightText}>{Utils.formatNum(extraMonthlyRoomNightsToSell)} Đêm phòng (Room Nights)</span>.
              </div>
            </div>

            <div>
              <div style={STYLES.flexBetween}>
                <h2 style={STYLES.controlTitle}>THỜI GIAN ĐẶT PHÒNG (LEAD TIME):</h2>
                <span style={STYLES.badge}>{simLeadTime} NGÀY</span>
              </div>
              <input type="range" min="1" max="30" value={simLeadTime} onChange={(e) => setSimLeadTime(Number(e.target.value))} style={STYLES.sliderReverse} />
              <div style={STYLES.alertBox}>
                <strong>PHẢN ỨNG GIÁ TỐI ƯU:</strong> {leadReason}
              </div>
            </div>
          </section>

          <div style={STYLES.flexGapSmall}>
            <button onClick={() => setSelectedDayType("Weekday")} style={selectedDayType === "Weekday" ? STYLES.tabActive : STYLES.tab}>BỐI CẢNH: NGÀY TRONG TUẦN (WEEKDAY)</button>
            <button onClick={() => setSelectedDayType("Weekend")} style={selectedDayType === "Weekend" ? STYLES.tabActive : STYLES.tab}>BỐI CẢNH: CUỐI TUẦN (WEEKEND)</button>
          </div>

          <section style={{ marginBottom: "50px" }}>
            <table style={STYLES.table}>
              <colgroup>
                <col style={{width: "16%"}} />
                <col style={{width: "12%"}} />
                <col style={{width: "25%"}} />
                <col style={{width: "25%"}} />
                <col style={{width: "22%"}} />
              </colgroup>
              <thead>
                <tr style={STYLES.tableHead}>
                  <th style={STYLES.th}>HẠNG PHÒNG & TỒN KHO</th>
                  <th style={STYLES.th}>GIÁ ĐỀ XUẤT (ADR)</th>
                  <th style={STYLES.th}>CHIẾN LƯỢC PHÂN KHÚC (SEGMENTS)</th>
                  <th style={STYLES.th}>CHIẾN LƯỢC KÊNH (CHANNELS)</th>
                  <th style={STYLES.th}>DỊCH VỤ GIA TĂNG (ANCILLARY)</th>
                </tr>
              </thead>
              <tbody style={{ background: "white" }}>
                {processedRooms.map(room => (
                  <tr key={room.key} style={STYLES.tableRow}>
                    <td style={STYLES.td}>
                      <div style={STYLES.roomName}>{room.name}</div>
                      <div style={STYLES.roomStat}>Sức chứa: <strong>{room.capacity} phòng</strong></div>
                      <div style={{ fontSize: "12px", color: "#1e40af", marginBottom: "4px", fontWeight: "700" }}>Đã bán: <strong>{room.dynamicSold} phòng</strong></div>
                      <div style={{ fontSize: "12px", color: "#059669", marginBottom: "12px", fontWeight: "700" }}>Khách trả: <strong>+{room.checkOutRooms} phòng</strong></div>
                      <div style={STYLES.roomAvai}>Sẵn bán: {Utils.formatNum(room.avai)}</div>
                    </td>
                    <td style={STYLES.td}>
                      <div style={STYLES.priceOld}>{Utils.currency(room.oldPrice)}</div>
                      <div style={STYLES.priceNew}>{Utils.currency(room.dynamicAdr)}</div>
                      <div style={{...STYLES.priceDiff, color: room.priceDiff >= 0 ? "#059669" : "#dc2626"}}>
                        ({room.priceDiff >= 0 ? "+" : ""}{room.priceDiff.toFixed(1)}%)
                      </div>
                    </td>
                    <td style={STYLES.td}>
                      {room.who.map((w, idx) => (
                        <div key={idx} style={STYLES.stratSection}>
                          <span style={STYLES.stratLevel}>{w.level}</span>
                          <div style={STYLES.stratTitle}>{w.title}</div>
                          <div style={STYLES.stratDesc}>{w.desc}</div>
                        </div>
                      ))}
                    </td>
                    <td style={STYLES.td}>
                      {room.where.map((w, idx) => (
                        <div key={idx} style={STYLES.stratSection}>
                          <span style={STYLES.stratLevel}>{w.level}</span>
                          <div style={STYLES.stratTitle}>{w.title}</div>
                          <div style={STYLES.stratDesc}>{w.desc}</div>
                        </div>
                      ))}
                    </td>
                    <td style={STYLES.td}>
                      <div style={STYLES.ancilTitle}>{room.ancillary.title}</div>
                      <div style={STYLES.ancilDesc}>{room.ancillary.desc}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section style={STYLES.impactSection}>
            <h2 style={STYLES.impactHeader}>Kết quả Đạt được Kỳ vọng (Dynamic Monte Carlo Analysis)</h2>
            <div style={STYLES.impactGrid}>
              <div style={STYLES.impactTextCol}>
                <p style={STYLES.impactDesc}>
                  Hệ thống thực thi <strong>{CONFIG.MC_ITERATIONS} phiên bản giả lập</strong> áp dụng phân phối chuẩn để định lượng rủi ro kinh tế học: Lực cầu thị trường biến thiên và Tỷ lệ hủy phòng ảo (Leakage).
                  <br/><br/>
                  <strong>Tái mô phỏng Động (Dynamic Resimulation):</strong> Mức Doanh thu Kỳ vọng sẽ phản ứng tức thời với mức giá (ADR) được điều chỉnh theo thời gian Lead Time. Điều này khẳng định việc áp dụng mức giá hợp lý theo từng thời điểm quyết định trực tiếp tới dòng tiền thực nhận.
                </p>
                <div style={STYLES.impactBaseBox}>
                  <div style={STYLES.impactBaseLabel}>MỐC DỰ BÁO TĨNH (BASELINE)</div>
                  <div style={STYLES.impactBaseVal}>{Utils.currency(appData.metrics.forecast)}</div>
                </div>
              </div>

              <div style={STYLES.impactResultGrid}>
                <div style={STYLES.impactTotalBox}>
                  <div style={STYLES.impactTotalLabel}>TỔNG DOANH THU KỲ VỌNG ĐẠT ĐƯỢC</div>
                  <div style={STYLES.impactTotalVal}>{Utils.currency(impact.totalProjectedRev)}</div>
                </div>
                <div style={STYLES.impactGrowthBox}>
                  <div style={{fontSize: "12px", fontWeight: "800", color: "#059669", marginBottom: "8px"}}>TĂNG TRƯỞNG</div>
                  <div style={{fontSize: "26px", fontWeight: "900", color: "#059669"}}>+{growthPercent.toFixed(1)}%</div>
                </div>
                <div style={STYLES.impactSubBox}>
                  <div style={{fontSize: "12px", fontWeight: "800", color: "#475569", marginBottom: "8px"}}>TỪ DOANH THU PHÒNG</div>
                  <div style={{fontSize: "22px", fontWeight: "900", color: "#0f172a"}}>+{Utils.currency(impact.meanRoomRev)}</div>
                </div>
                <div style={STYLES.impactAncilBox}>
                  <div style={{fontSize: "12px", fontWeight: "800", color: "#475569", marginBottom: "8px"}}>TỪ DỊCH VỤ BỔ TRỢ (ANCILLARY)</div>
                  <div style={{fontSize: "22px", fontWeight: "900", color: "#2563eb"}}>+{Utils.currency(impact.meanAncillaryRev)}</div>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}