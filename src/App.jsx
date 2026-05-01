import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";

// ============================================================================
// 1. CONFIGURATION (Loại bỏ Magic Numbers)
// ============================================================================
const CONFIG = {
  MC_ITERATIONS: 2000,
  TARGET_MONTH: "2026-01",
  DAYS_IN_MONTH: 31,
  TOTAL_ROOMS: 80,
  ANCILLARY_RATIO: 0.18,
  MC_PARAMS: {
    DEMAND_MEAN: 0.85,    // Trung bình lực cầu 85%
    DEMAND_STD_DEV: 0.05, // Độ lệch chuẩn 5%
    CANCEL_MEAN: 0.10,    // Trung bình hủy phòng 10%
    CANCEL_STD_DEV: 0.02  // Độ lệch chuẩn 2%
  },
  DEFAULT_METRICS: { forecast: 125494, onHand: 110744 }
};

// ============================================================================
// 2. UTILITIES & MATH (Format và Thuật toán khoa học)
// ============================================================================
const Utils = {
  currency: (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v || 0),
  formatNum: (v) => new Intl.NumberFormat("en-US").format(Math.round(v)),
  
  // Thuật toán Box-Muller: Tạo random theo Phân phối chuẩn (Normal Distribution)
  randomNormal: (mean, stdDev) => {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + num * stdDev;
  }
};

// ============================================================================
// 3. DATA & BUSINESS SERVICES (Tách biệt Logic xử lý dữ liệu)
// ============================================================================
const DataService = {
  readExcel: (file) => {
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

  // Xử lý dữ liệu Tồn kho và Giá động từ File
  processInventory: (histWb) => {
    // Khởi tạo khung dữ liệu
    let inventory = {
      Weekday: { RT_STD: { cap: 0, avai: 0, days: 0 }, RT_DLX: { cap: 0, avai: 0, days: 0 }, RT_STE: { cap: 0, avai: 0, days: 0 } },
      Weekend: { RT_STD: { cap: 0, avai: 0, days: 0 }, RT_DLX: { cap: 0, avai: 0, days: 0 }, RT_STE: { cap: 0, avai: 0, days: 0 } }
    };

    if (!histWb) return null;

    try {
      // Tìm Sheet Inventory (RoomInventoryDaily)
      const invSheetName = histWb.SheetNames.find(n => n.toLowerCase().includes("inventory"));
      if (invSheetName) {
        const invData = XLSX.utils.sheet_to_json(histWb.Sheets[invSheetName]);
        
        invData.forEach(row => {
          const dateStr = String(row.inventory_date || row.date || "");
          const monthStr = String(row.month || "");
          
          // Lọc dữ liệu đúng tháng 1/2026
          if (dateStr.includes(CONFIG.TARGET_MONTH) || monthStr === CONFIG.TARGET_MONTH) {
            const rt = row.room_type_id || row.room_type;
            const cap = parseFloat(row.rooms_total || 0);
            const avai = parseFloat(row.rooms_available_for_sale || 0);
            const dayType = row.day_type === "Weekend" ? "Weekend" : "Weekday"; // Phân loại Weekday/Weekend

            if (inventory[dayType] && inventory[dayType][rt]) {
              inventory[dayType][rt].cap += cap;
              inventory[dayType][rt].avai += avai;
              inventory[dayType][rt].days += 1; // Đếm số dòng (số ngày) để chia trung bình
            }
          }
        });
      }

      // Tính trung bình mỗi ngày
      const result = { Weekday: {}, Weekend: {} };
      ["Weekday", "Weekend"].forEach(dt => {
        ["RT_STD", "RT_DLX", "RT_STE"].forEach(rt => {
          const stats = inventory[dt][rt];
          const days = stats.days > 0 ? stats.days : 1; // Tránh chia cho 0
          
          const avgCap = Math.round(stats.cap / days);
          const avgAvai = Math.round(stats.avai / days);
          const avgSold = avgCap - avgAvai; // Tính số đã bán = Sức chứa - Sẵn bán

          result[dt][rt] = {
            capacity: avgCap || (rt === 'RT_STD' ? 45 : rt === 'RT_DLX' ? 28 : 7), // Fallback
            baseAvai: avgAvai || 0,
            sold: avgSold || 0,
            oldPrice: rt === 'RT_STD' ? 95 : rt === 'RT_DLX' ? 129 : 220, // Tạm fix Base price
            targetRatio: rt === 'RT_STD' ? 0.6 : rt === 'RT_DLX' ? 0.5 : 0.8
          };
        });
      });
      return result;
    } catch (e) {
      console.warn("Lỗi trích xuất Inventory, dùng Failsafe.");
      return null;
    }
  },

  getStrategies: (dayType, key) => {
    const data = {
      Weekday: {
        RT_STD: {
          name: "HẠNG TIÊU CHUẨN",
          who: [{ level: "Ưu tiên 1", text: "Corporate (B2B): Tạo nền tảng công suất." }, { level: "Ưu tiên 2", text: "Group: Khách đoàn lưu trú dài ngày." }],
          where: [{ level: "Kênh chính", text: "Direct B2B Contract: Miễn hoa hồng OTA." }],
          ancillary: "MICE Bundle (Dịch vụ F&B + Laundry)"
        },
        RT_DLX: {
          name: "HẠNG CAO CẤP",
          who: [{ level: "Ưu tiên 1", text: "Leisure: Nguồn thu chủ lực giữa tuần." }],
          where: [{ level: "Kênh chính", text: "Direct Website: Chặn rủi ro hủy ảo OTA (17.8%)." }],
          ancillary: "Spa & Tour Bundle"
        },
        RT_STE: {
          name: "HẠNG VIP",
          who: [{ level: "Ưu tiên 1", text: "MICE VIPs: Quản lý cấp cao tham gia sự kiện." }],
          where: [{ level: "Kênh chính", text: "Direct Phone / GDS: Giữ hình ảnh thương hiệu." }],
          ancillary: "Luxury Service Bundle"
        }
      },
      Weekend: {
        RT_STD: {
          name: "HẠNG TIÊU CHUẨN",
          who: [{ level: "Ưu tiên 1", text: "Leisure: Cầu du lịch tự túc cuối tuần cao." }],
          where: [{ level: "Kênh 1", text: "OTA: Kéo Volume mạnh nhưng kèm Non-refundable." }],
          ancillary: "Buffet Bundle (F&B)"
        },
        RT_DLX: {
          name: "HẠNG CAO CẤP",
          who: [{ level: "Ưu tiên 1", text: "Leisure Couples: Sẵn sàng chi trả cao." }],
          where: [{ level: "Kênh 1", text: "Direct Website: Chạy quảng cáo gói Weekend Retreat." }],
          ancillary: "Spa Retreat Package"
        },
        RT_STE: {
          name: "HẠNG VIP",
          who: [{ level: "Ưu tiên 1", text: "Leisure VIP: Dữ liệu lấp đầy Suite đạt đỉnh 57.4%." }],
          where: [{ level: "Kênh 1", text: "Direct Phone: Bảo vệ dòng tiền, triệt tiêu No-show." }],
          ancillary: "Premium Heritage Bundle"
        }
      }
    };
    return data[dayType][key];
  }
};

// ============================================================================
// 4. MAIN COMPONENT
// ============================================================================
export default function App() {
  const [historyFile, setHistoryFile] = useState(null);
  const [forecastFile, setForecastFile] = useState(null);
  
  // State quản lý dữ liệu toàn cục
  const [appData, setAppData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // State điều khiển UI
  const [selectedDayType, setSelectedDayType] = useState("Weekday");
  const [simLeadTime, setSimLeadTime] = useState(15); 
  const [targetOccupancy, setTargetOccupancy] = useState(65);

  const handleProcessData = async () => {
    if (!historyFile || !forecastFile) return alert("Hệ thống yêu cầu đủ 2 file dữ liệu.");
    setIsProcessing(true);

    try {
      const [histWb, forecastWb] = await Promise.all([DataService.readExcel(historyFile), DataService.readExcel(forecastFile)]);
      
      // Khởi tạo biến lưu trữ
      let metrics = { ...CONFIG.DEFAULT_METRICS };
      
      // Quét Forecast
      if (forecastWb) {
        const summarySheet = forecastWb.SheetNames.find(n => n.toLowerCase().includes("summary")) || forecastWb.SheetNames[0];
        const summaryData = XLSX.utils.sheet_to_json(forecastWb.Sheets[summarySheet]);
        summaryData.forEach(row => {
          const vals = Object.values(row);
          if (vals.length >= 2 && !isNaN(parseFloat(vals[1]))) {
            if (String(vals[0]).includes("Forecast Total")) metrics.forecast = parseFloat(vals[1]);
            if (String(vals[0]).includes("On-hand Total")) metrics.onHand = parseFloat(vals[1]);
          }
        });
      }

      // Quét Lịch sử lấy Tồn kho
      const inventoryData = DataService.processInventory(histWb);

      setAppData({ metrics, inventoryData });
      setIsProcessing(false);
    } catch (err) { 
      setIsProcessing(false); 
      alert("Lỗi xử lý file, vui lòng kiểm tra định dạng.");
    }
  };

  // ĐỘNG CƠ PHÂN TÍCH (ANALYTICS & MONTE CARLO ENGINE)
  // Chỉ chạy lại khi Data gốc hoặc thông số Điều khiển thay đổi
  const analyticsData = useMemo(() => {
    if (!appData || !appData.inventoryData) return null;

    const baseData = appData.inventoryData[selectedDayType];
    const totalSoldToday = baseData.RT_STD.sold + baseData.RT_DLX.sold + baseData.RT_STE.sold;
    const baseOccupancy = (totalSoldToday / CONFIG.TOTAL_ROOMS) * 100;

    const targetDailyRooms = Math.round(CONFIG.TOTAL_ROOMS * (targetOccupancy / 100));
    const extraDailyRoomsToSell = Math.max(0, targetDailyRooms - totalSoldToday);
    const extraMonthlyRoomsToSell = extraDailyRoomsToSell * CONFIG.DAYS_IN_MONTH; 

    // ĐỊNH GIÁ ĐA TẦNG THEO LEAD TIME
    let leadMultiplier = 1.0;
    let leadReason = "";

    if (simLeadTime <= 3) {
      leadMultiplier = 1.15;
      leadReason = "[Tier 1 - Khẩn cấp]: Khách hàng cận ngày. Khuyến nghị TĂNG GIÁ 15%.";
    } else if (simLeadTime <= 7) {
      leadMultiplier = 1.05;
      leadReason = "[Tier 2 - Ngắn hạn]: Khách chốt lịch trình. Khuyến nghị TĂNG GIÁ 5%.";
    } else if (simLeadTime <= 14) {
      leadMultiplier = 1.00;
      leadReason = "[Tier 3 - Tiêu chuẩn]: Cung cầu cân bằng. DUY TRÌ GIÁ BASE.";
    } else if (simLeadTime <= 21) {
      leadMultiplier = 0.95;
      leadReason = "[Tier 4 - Đặt sớm]: Kích cầu. GIẢM GIÁ 5%, kèm Hủy mất phí 50%.";
    } else {
      leadMultiplier = 0.90;
      leadReason = "[Tier 5 - Dài hạn]: Thu hút Base Volume. GIẢM GIÁ 10%, kèm Non-refundable.";
    }

    const inventoryFactor = Math.min(1, 0.2 + (0.8 * (simLeadTime / 30)));

    const processedRooms = ["RT_STD", "RT_DLX", "RT_STE"].map(key => {
      const roomBase = baseData[key];
      const strat = DataService.getStrategies(selectedDayType, key);
      
      const dynamicAvai = Math.max(0, Math.round(roomBase.baseAvai * inventoryFactor));
      const dynamicAdr = roomBase.oldPrice * leadMultiplier;
      const priceDiff = ((dynamicAdr / roomBase.oldPrice) - 1) * 100;

      return { key, avai: dynamicAvai, dynamicAdr, priceDiff, ...roomBase, ...strat };
    });

    // MÔ PHỎNG MONTE CARLO VỚI PHÂN PHỐI CHUẨN (NORMAL DISTRIBUTION)
    let successfulRoomRev = 0;
    const avgDynamicAdr = processedRooms.reduce((sum, r) => sum + r.dynamicAdr, 0) / 3;

    for (let i = 0; i < CONFIG.MC_ITERATIONS; i++) {
      // Dùng Box-Muller thay vì Random tuyến tính
      const demandCapture = Utils.randomNormal(CONFIG.MC_PARAMS.DEMAND_MEAN, CONFIG.MC_PARAMS.DEMAND_STD_DEV);
      const cancelRatio = Utils.randomNormal(CONFIG.MC_PARAMS.CANCEL_MEAN, CONFIG.MC_PARAMS.CANCEL_STD_DEV);
      
      // Đảm bảo giá trị nằm trong khoảng hợp lý
      const boundedDemand = Math.max(0, Math.min(1, demandCapture));
      const boundedCancel = Math.max(0, Math.min(1, cancelRatio));

      const conversionRate = boundedDemand * (1 - boundedCancel);
      const simulatedMonthlyRoomsSold = extraMonthlyRoomsToSell * conversionRate;
      
      successfulRoomRev += (simulatedMonthlyRoomsSold * avgDynamicAdr);
    }

    const meanRoomRev = successfulRoomRev / CONFIG.MC_ITERATIONS;
    const meanAncillaryRev = meanRoomRev * CONFIG.ANCILLARY_RATIO; 
    const totalProjectedRev = appData.metrics.onHand + meanRoomRev + meanAncillaryRev;
    
    return { baseOccupancy, extraMonthlyRoomsToSell, leadReason, processedRooms, impact: { totalProjectedRev, meanRoomRev, meanAncillaryRev } };

  }, [appData, selectedDayType, simLeadTime, targetOccupancy]);

  // ============================================================================
  // RENDER UI 
  // ============================================================================
  if (!appData) {
    return (
      <div style={STYLES.layoutCenter}>
        <div style={STYLES.bgBlur} />
        <div style={STYLES.loginCard}>
          <h1 style={STYLES.heading}>Hệ thống Hoạch định Doanh thu (BI)</h1>
          <p style={STYLES.subHeading}>Phân hệ Chẩn đoán & Kê toa Chiến lược - Heritage Hue Hotel</p>
          
          <div style={STYLES.flexGap}>
            <div style={STYLES.uploadBox}>
              <p style={STYLES.uploadTitle}>1. DỮ LIỆU LỊCH SỬ (CLEANED)</p>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setHistoryFile(e.target.files[0])} />
            </div>
            <div style={STYLES.uploadBox}>
              <p style={STYLES.uploadTitle}>2. DỮ LIỆU DỰ BÁO (FORECAST)</p>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setForecastFile(e.target.files[0])} />
            </div>
          </div>
          <button onClick={handleProcessData} disabled={isProcessing} style={STYLES.btnPrimary}>
            {isProcessing ? "HỆ THỐNG ĐANG XỬ LÝ..." : "Xác thực & Kết xuất Báo cáo"}
          </button>
        </div>
      </div>
    );
  }

  const { baseOccupancy, extraMonthlyRoomsToSell, leadReason, processedRooms, impact } = analyticsData;
  const growthPercent = ((impact.totalProjectedRev / appData.metrics.forecast) - 1) * 100;

  return (
    <div style={STYLES.layoutMain}>
      <div style={STYLES.bgBlurLight} />
      <div style={STYLES.dashboardContainer}>
        
        <header style={STYLES.header}>
          <h1 style={STYLES.headerTitle}>Báo cáo Quản trị & Tối ưu Doanh thu - Tháng 01/2026</h1>
          <p style={STYLES.headerSub}>Áp dụng Định giá 5 Tầng, Tồn kho Động & Monte Carlo (Normal Distribution).</p>
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
                <h2 style={STYLES.controlTitle}>MỤC TIÊU CÔNG SUẤT (OCCUPANCY):</h2>
                <span style={STYLES.badge}>{targetOccupancy}%</span>
              </div>
              <input type="range" min="40" max="95" value={targetOccupancy} onChange={(e) => setTargetOccupancy(Number(e.target.value))} style={STYLES.slider} />
              <div style={STYLES.helperText}>
                Gốc Lịch sử: <strong>{baseOccupancy.toFixed(1)}%</strong>. Cần bán thêm trong tháng: <strong style={{color:"#1e3a8a"}}>{Utils.formatNum(extraMonthlyRoomsToSell)} Đêm phòng</strong>.
              </div>
            </div>

            <div>
              <div style={STYLES.flexBetween}>
                <h2 style={STYLES.controlTitle}>THỜI GIAN ĐẶT PHÒNG (LEAD TIME):</h2>
                <span style={STYLES.badge}>{simLeadTime} NGÀY</span>
              </div>
              <input type="range" min="1" max="30" value={simLeadTime} onChange={(e) => setSimLeadTime(Number(e.target.value))} style={STYLES.sliderReverse} />
              <div style={STYLES.alertBox}>
                <strong>PHẢN ỨNG GIÁ:</strong> {leadReason}
              </div>
            </div>
          </section>

          <div style={STYLES.flexGapSmall}>
            <button onClick={() => setSelectedDayType("Weekday")} style={selectedDayType === "Weekday" ? STYLES.tabActive : STYLES.tab}>BỐI CẢNH LÀM VIỆC: NGÀY TRONG TUẦN</button>
            <button onClick={() => setSelectedDayType("Weekend")} style={selectedDayType === "Weekend" ? STYLES.tabActive : STYLES.tab}>BỐI CẢNH LÀM VIỆC: CUỐI TUẦN</button>
          </div>

          <section style={{ marginBottom: "50px" }}>
            <table style={STYLES.table}>
              <thead>
                <tr style={STYLES.tableHead}>
                  <th style={STYLES.th}>HẠNG PHÒNG & TÌNH TRẠNG NGÀY</th>
                  <th style={STYLES.th}>ĐỊNH GIÁ ĐA TẦNG (ADR)</th>
                  <th style={STYLES.th}>MỤC TIÊU PHÂN KHÚC KHÁCH HÀNG</th>
                  <th style={STYLES.th}>CHIẾN LƯỢC KÊNH PHÂN PHỐI</th>
                  <th style={STYLES.th}>DỊCH VỤ GIA TĂNG (BUNDLE)</th>
                </tr>
              </thead>
              <tbody style={{ background: "white" }}>
                {processedRooms.map(room => (
                  <tr key={room.key} style={STYLES.tableRow}>
                    <td style={STYLES.td}>
                      <div style={STYLES.roomName}>{room.name}</div>
                      <div style={STYLES.roomStat}>Sức chứa: <strong>{room.capacity} phòng</strong></div>
                      <div style={STYLES.roomStat}>Đã bán: <strong>{room.sold} phòng</strong></div>
                      <div style={STYLES.roomAvai}>
                        Sẵn bán (Available): {Utils.formatNum(room.avai)}
                      </div>
                    </td>
                    <td style={STYLES.td}>
                      <div style={STYLES.priceOld}>{Utils.currency(room.oldPrice)}</div>
                      <div style={STYLES.priceNew}>{Utils.currency(room.dynamicAdr)}</div>
                      <div style={{...STYLES.priceDiff, color: room.priceDiff >= 0 ? "#059669" : "#dc2626"}}>
                        ({room.priceDiff >= 0 ? "+" : ""}{room.priceDiff.toFixed(1)}%)
                      </div>
                    </td>
                    <td style={STYLES.td}>
                      <ul style={STYLES.ul}>
                        {room.who.map((w, idx) => <li key={idx} style={{ marginBottom: "8px" }}><strong>{w.level}:</strong> {w.text}</li>)}
                      </ul>
                    </td>
                    <td style={STYLES.td}>
                      <ul style={STYLES.ul}>
                        {room.where.map((w, idx) => <li key={idx} style={{ marginBottom: "8px" }}><strong>{w.level}:</strong> {w.text}</li>)}
                      </ul>
                    </td>
                    <td style={STYLES.tdAncillary}>{room.ancillary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section style={STYLES.impactSection}>
            <h2 style={STYLES.impactHeader}>Kết quả Đạt được Kỳ vọng (Monte Carlo Analysis - Box Muller)</h2>
            <div style={STYLES.impactGrid}>
              <div style={STYLES.impactTextCol}>
                <p style={STYLES.impactDesc}>
                  Hệ thống thực thi <strong>{CONFIG.MC_ITERATIONS} phiên bản giả lập</strong> áp dụng phân phối chuẩn (Normal Distribution) để định lượng rủi ro kinh tế học: Lực cầu thị trường và Tỷ lệ hủy phòng ảo trên kênh OTA.
                  <br/><br/>
                  Kết hợp <strong>Định giá đa tầng</strong> và <strong>Mục tiêu Công suất {targetOccupancy}%</strong>, Khối Kinh doanh có cơ sở phá vỡ giới hạn dự báo tĩnh.
                </p>
                <div style={STYLES.impactBaseBox}>
                  <div style={STYLES.impactBaseLabel}>MỐC DỰ BÁO TĨNH (BASELINE)</div>
                  <div style={STYLES.impactBaseVal}>{Utils.currency(appData.metrics.forecast)}</div>
                </div>
              </div>

              <div style={STYLES.impactResultGrid}>
                <div style={STYLES.impactTotalBox}>
                  <div style={STYLES.impactTotalLabel}>TỔNG DOANH THU KỲ VỌNG (EXPECTED VALUE)</div>
                  <div style={STYLES.impactTotalVal}>{Utils.currency(impact.totalProjectedRev)}</div>
                </div>
                <div style={STYLES.impactGrowthBox}>
                  <div style={{fontSize: "11px", fontWeight: "700", color: "#059669"}}>TĂNG TRƯỞNG</div>
                  <div style={{fontSize: "24px", fontWeight: "800", color: "#059669"}}>+{growthPercent.toFixed(1)}%</div>
                </div>
                <div style={STYLES.impactSubBox}>
                  <div style={{fontSize: "11px", fontWeight: "700", color: "#475569"}}>ROOM REVENUE GAIN</div>
                  <div style={{fontSize: "20px", fontWeight: "800", color: "#0f172a"}}>+{Utils.currency(impact.meanRoomRev)}</div>
                </div>
                <div style={STYLES.impactAncilBox}>
                  <div style={{fontSize: "11px", fontWeight: "700", color: "#475569"}}>ANCILLARY REVENUE GAIN</div>
                  <div style={{fontSize: "20px", fontWeight: "800", color: "#2563eb"}}>+{Utils.currency(impact.meanAncillaryRev)}</div>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 5. THEME & STYLES (Trích xuất toàn bộ Inline Styles)
// ============================================================================
const STYLES = {
  layoutCenter: { minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", position: "relative", padding: "20px", fontFamily: "system-ui, sans-serif" },
  bgBlur: { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundImage: "url('image_74fb96.jpg')", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(12px)", opacity: 0.4, zIndex: -1 },
  loginCard: { background: "white", padding: "50px", width: "100%", maxWidth: "800px", borderTop: "4px solid #1e3a8a", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" },
  heading: { color: "#0f172a", margin: "0 0 10px 0", fontSize: "28px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "1px" },
  subHeading: { color: "#64748b", margin: "0 0 30px 0", fontSize: "14px", fontWeight: "500" },
  flexGap: { display: "flex", gap: "20px", marginBottom: "30px" },
  uploadBox: { flex: 1, border: "1px solid #cbd5e1", padding: "25px 20px", background: "#f8fafc" },
  uploadTitle: { fontSize: "12px", fontWeight: "700", color: "#1e3a8a", margin: "0 0 10px 0" },
  btnPrimary: { background: "#1e3a8a", color: "white", padding: "16px", border: "none", cursor: "pointer", fontWeight: "700", letterSpacing: "1px", width: "100%", fontSize: "14px", textTransform: "uppercase" },
  
  layoutMain: { minHeight: "100vh", padding: "40px", fontFamily: "system-ui, sans-serif", color: "#0f172a" },
  bgBlurLight: { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundImage: "url('image_74fb96.jpg')", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(20px)", opacity: 0.25, zIndex: -1 },
  dashboardContainer: { maxWidth: "1400px", margin: "0 auto", background: "white", boxShadow: "0 10px 40px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" },
  header: { background: "#0f172a", padding: "30px 40px", color: "white", borderBottom: "4px solid #1e3a8a" },
  headerTitle: { fontSize: "22px", fontWeight: "800", textTransform: "uppercase", margin: "0 0 8px 0", letterSpacing: "1px" },
  headerSub: { margin: 0, color: "#94a3b8", fontSize: "13px", fontWeight: "500" },
  contentArea: { padding: "40px" },
  
  grid2Col: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "25px", marginBottom: "40px" },
  metricCardActive: { padding: "25px", border: "1px solid #cbd5e1", background: "#f8fafc", borderLeft: "4px solid #1e3a8a" },
  metricCard: { padding: "25px", border: "1px solid #cbd5e1", background: "white", borderLeft: "4px solid #64748b" },
  metricLabel: { fontSize: "12px", color: "#475569", fontWeight: "700", letterSpacing: "0.5px" },
  metricValue: { fontSize: "32px", fontWeight: "800", color: "#0f172a", marginTop: "10px" },
  
  controlSection: { marginBottom: "35px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px", padding: "35px", background: "#f8fafc", border: "1px solid #e2e8f0" },
  flexBetween: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" },
  controlTitle: { fontSize: "14px", fontWeight: "700", color: "#0f172a", margin: 0 },
  badge: { fontSize: "16px", fontWeight: "800", color: "white", background: "#1e3a8a", padding: "4px 12px" },
  slider: { width: "100%", accentColor: "#1e3a8a", cursor: "pointer" },
  sliderReverse: { width: "100%", accentColor: "#1e3a8a", cursor: "pointer", direction: "rtl" },
  helperText: { marginTop: "15px", fontSize: "13px", color: "#475569", lineHeight: "1.6" },
  alertBox: { marginTop: "15px", fontSize: "13px", color: "#1e3a8a", lineHeight: "1.6", borderLeft: "3px solid #1e3a8a", paddingLeft: "15px", background: "#eff6ff", padding: "10px" },
  
  flexGapSmall: { display: "flex", gap: "5px", marginBottom: "20px" },
  tabActive: { flex: 1, padding: "15px", border: "1px solid #cbd5e1", cursor: "pointer", background: "#1e3a8a", color: "white", fontWeight: "700", fontSize: "13px", transition: "0.2s" },
  tab: { flex: 1, padding: "15px", border: "1px solid #cbd5e1", cursor: "pointer", background: "#f8fafc", color: "#475569", fontWeight: "700", fontSize: "13px", transition: "0.2s" },
  
  table: { width: "100%", borderCollapse: "collapse", border: "1px solid #cbd5e1" },
  tableHead: { textAlign: "left", background: "#f8fafc", borderBottom: "2px solid #1e3a8a" },
  th: { padding: "16px 20px", fontSize: "12px", color: "#1e3a8a", textTransform: "uppercase", fontWeight: "800" },
  tableRow: { borderBottom: "1px solid #e2e8f0" },
  td: { padding: "25px 20px", verticalAlign: "top" },
  roomName: { fontWeight: "800", color: "#0f172a", fontSize: "14px", marginBottom: "12px" },
  roomStat: { fontSize: "12px", color: "#64748b", marginBottom: "4px" },
  roomAvai: { fontSize: "12px", fontWeight: "700", color: "#1e3a8a", padding: "6px 10px", background: "#f1f5f9", border: "1px solid #cbd5e1", display: "inline-block", marginTop: "4px" },
  priceOld: { fontSize: "13px", color: "#94a3b8", textDecoration: "line-through" },
  priceNew: { fontSize: "22px", fontWeight: "800", color: "#0f172a", margin: "6px 0" },
  priceDiff: { fontSize: "12px", fontWeight: "700" },
  ul: { paddingLeft: "15px", margin: 0, fontSize: "13px", color: "#334155", lineHeight: "1.7" },
  tdAncillary: { padding: "25px 20px", verticalAlign: "top", fontSize: "13px", fontWeight: "700", color: "#1e3a8a", lineHeight: "1.6" },
  
  impactSection: { border: "1px solid #cbd5e1", background: "white", overflow: "hidden" },
  impactHeader: { fontSize: "15px", fontWeight: "800", color: "#0f172a", background: "#f1f5f9", margin: 0, padding: "20px 25px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" },
  impactGrid: { padding: "40px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "40px" },
  impactTextCol: { borderRight: "1px solid #e2e8f0", paddingRight: "40px" },
  impactDesc: { fontSize: "14px", color: "#475569", lineHeight: "1.8", margin: "0 0 25px 0" },
  impactBaseBox: { padding: "20px", background: "#f1f5f9", border: "1px solid #cbd5e1" },
  impactBaseLabel: { fontSize: "12px", fontWeight: "700", color: "#64748b", marginBottom: "5px" },
  impactBaseVal: { fontSize: "24px", fontWeight: "800", color: "#0f172a" },
  impactResultGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" },
  impactTotalBox: { padding: "20px", background: "#0f172a", color: "white", gridColumn: "1 / -1", borderLeft: "4px solid #1e3a8a" },
  impactTotalLabel: { fontSize: "12px", fontWeight: "700", color: "#94a3b8", marginBottom: "5px" },
  impactTotalVal: { fontSize: "32px", fontWeight: "800", color: "white" },
  impactGrowthBox: { padding: "15px", background: "#f0fdf4", border: "1px solid #bbf7d0" },
  impactSubBox: { padding: "15px", background: "white", border: "1px solid #cbd5e1" },
  impactAncilBox: { padding: "15px", background: "white", border: "1px solid #cbd5e1", gridColumn: "1 / -1" }
};