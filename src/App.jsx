import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

const data = {
  hotel: "Heritage Hue Hotel",
  monthOverview: [
    { month: "2025-07", total_revenue: 53619.22, room_revenue: 43122.62, ancillary_revenue: 10496.6 },
    { month: "2025-08", total_revenue: 119034.74, room_revenue: 95447.97, ancillary_revenue: 23586.77 },
    { month: "2025-09", total_revenue: 152712.84, room_revenue: 122965.75, ancillary_revenue: 29747.09 },
    { month: "2025-10", total_revenue: 157017.97, room_revenue: 127182.17, ancillary_revenue: 29835.8 },
    { month: "2025-11", total_revenue: 189171.04, room_revenue: 157529.61, ancillary_revenue: 31641.43 },
    { month: "2025-12", total_revenue: 180388.79, room_revenue: 149348.81, ancillary_revenue: 31039.98 },
    { month: "2026-01", total_revenue: 114387.37, room_revenue: 90573.21, ancillary_revenue: 23814.16 },
  ],
  roomRecommendations: {
    Weekday: [
      {
        roomType: "Standard",
        availableRooms: 28.7,
        currentAdr: 90.72,
        recommendedAdr: 88.0,
        targetSegment: "Corporate / Long-stay",
        targetOccupancy: 42.3,
        revparProjected: 37.23,
        trevparProjected: 49.89,
        confidence: 93.9,
        note: "Ngày thường tồn phòng còn rộng nên ưu tiên kéo occupancy bằng weekday value rate và long-stay package.",
      },
      {
        roomType: "Deluxe",
        availableRooms: 17.9,
        currentAdr: 131.31,
        recommendedAdr: 130.0,
        targetSegment: "Corporate + Bleisure",
        targetOccupancy: 41.3,
        revparProjected: 53.72,
        trevparProjected: 65.96,
        confidence: 92.0,
        note: "Giữ giá tương đối ổn định, cộng credit F&B để tăng chuyển đổi mà không giảm giá quá sâu.",
      },
      {
        roomType: "Suite",
        availableRooms: 4.4,
        currentAdr: 187.5,
        recommendedAdr: 187.5,
        targetSegment: "Executive / premium corporate",
        targetOccupancy: 37.9,
        revparProjected: 71.12,
        trevparProjected: 78.89,
        confidence: 91.1,
        note: "Suite tồn ít nên không nên discount mạnh, ưu tiên upsell trước check-in.",
      },
    ],
    Weekend: [
      {
        roomType: "Standard",
        availableRooms: 25.1,
        currentAdr: 98.28,
        recommendedAdr: 100.25,
        targetSegment: "Leisure / Family",
        targetOccupancy: 48.3,
        revparProjected: 48.44,
        trevparProjected: 65.32,
        confidence: 91.6,
        note: "Cuối tuần nên tăng giá nhẹ và bán kèm breakfast/package để kéo TRevPAR.",
      },
      {
        roomType: "Deluxe",
        availableRooms: 17.2,
        currentAdr: 123.55,
        recommendedAdr: 129.73,
        targetSegment: "Leisure couple / direct booker",
        targetOccupancy: 42.4,
        revparProjected: 55.01,
        trevparProjected: 67.45,
        confidence: 87.7,
        note: "Cuối tuần willingness-to-pay tốt hơn, nên tối ưu ADR và ancillary.",
      },
      {
        roomType: "Suite",
        availableRooms: 4.0,
        currentAdr: 188.32,
        recommendedAdr: 195.85,
        targetSegment: "Premium leisure",
        targetOccupancy: 42.9,
        revparProjected: 83.94,
        trevparProjected: 100.49,
        confidence: 85.8,
        note: "Đẩy premium package và late checkout để tăng giá trị đơn phòng.",
      },
    ],
  },
  ancillaryRecommendations: {
    Weekday: [
      {
        segment: "Corporate",
        characteristics: "Ở ngắn ngày, ưu tiên tiện lợi, nhạy với lợi ích thực tế hơn là ưu đãi phô trương.",
        recommendedServices: "Business lunch, airport transfer, laundry express",
        discountRule: "Giảm 10–12% khi occupancy forecast dưới 38% hoặc pickup chậm trước 3 ngày.",
        projectedAttachRate: "18% → 28%",
        projectedAncillarySpend: "$16 → $24",
        projectedTrevpar: "$46 → $53",
      },
      {
        segment: "Leisure Couple",
        characteristics: "Ưa trải nghiệm thư giãn, dễ bị hấp dẫn bởi combo cảm xúc và không gian đẹp.",
        recommendedServices: "Afternoon tea, spa mini retreat, sunset tour",
        discountRule: "Giảm 8–10% giữa tuần khi cần kích cầu, tránh giảm quá sâu.",
        projectedAttachRate: "22% → 33%",
        projectedAncillarySpend: "$21 → $31",
        projectedTrevpar: "$49 → $58",
      },
      {
        segment: "Family",
        characteristics: "Quan tâm tổng giá trị chuyến đi, thích combo dễ hiểu và tiết kiệm rõ ràng.",
        recommendedServices: "Family dinner combo, city tour pack, kids set",
        discountRule: "Giảm 12–15% cho stay từ 2 đêm khi need dates yếu.",
        projectedAttachRate: "15% → 26%",
        projectedAncillarySpend: "$18 → $27",
        projectedTrevpar: "$44 → $52",
      },
    ],
    Weekend: [
      {
        segment: "Corporate",
        characteristics: "Quy mô nhỏ hơn, nhưng vẫn phù hợp với các tiện ích nhanh gọn trong stay ngắn.",
        recommendedServices: "Express dinner, late check-out, airport transfer",
        discountRule: "Giảm 5–8% khi cuối tuần dưới 45% occupancy forecast.",
        projectedAttachRate: "16% → 22%",
        projectedAncillarySpend: "$15 → $20",
        projectedTrevpar: "$50 → $55",
      },
      {
        segment: "Leisure Couple",
        characteristics: "Phân khúc đẹp nhất cuối tuần, sẵn sàng chi thêm cho trải nghiệm lãng mạn và đồng bộ.",
        recommendedServices: "Romantic dinner, spa for two, heritage tour",
        discountRule: "Chỉ giảm 8–10% khi pickup chậm hơn forecast 20% hoặc tồn phòng cao trước 48 giờ.",
        projectedAttachRate: "26% → 40%",
        projectedAncillarySpend: "$29 → $42",
        projectedTrevpar: "$58 → $71",
      },
      {
        segment: "Family",
        characteristics: "Ưa combo trọn gói, dễ quyết định nếu lợi ích rõ ràng cho nhiều thành viên cùng lúc.",
        recommendedServices: "Family BBQ/dinner, half-day tour, welcome set",
        discountRule: "Giảm 10–12% khi Standard còn tồn nhiều và pace chậm hơn kế hoạch.",
        projectedAttachRate: "18% → 30%",
        projectedAncillarySpend: "$19 → $29",
        projectedTrevpar: "$52 → $61",
      },
    ],
  },
};

function currency(v) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(v || 0);
}

function kpiValue(v) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(v || 0);
}

export default function App() {
  const [selectedMode, setSelectedMode] = useState("forecast");
  const [selectedDayType, setSelectedDayType] = useState("Weekday");
  const [selectedSubTab, setSelectedSubTab] = useState("room");
  const [selectedRoomType, setSelectedRoomType] = useState("Standard");
  const [selectedSegment, setSelectedSegment] = useState("Corporate");

  const monthData = data.monthOverview;
  const roomOptions = data.roomRecommendations[selectedDayType];
  const ancillaryOptions = data.ancillaryRecommendations[selectedDayType];

  const selectedRoom = useMemo(() => {
    return roomOptions.find((r) => r.roomType === selectedRoomType) || roomOptions[0];
  }, [roomOptions, selectedRoomType]);

  const selectedAncillary = useMemo(() => {
    return ancillaryOptions.find((s) => s.segment === selectedSegment) || ancillaryOptions[0];
  }, [ancillaryOptions, selectedSegment]);

  const ancillaryScenarioData = [
    {
      name: "Attach rate",
      current: parseFloat(selectedAncillary.projectedAttachRate.split("→")[0]),
      projected: parseFloat(selectedAncillary.projectedAttachRate.split("→")[1]),
    },
    {
      name: "Ancillary spend",
      current: parseFloat(selectedAncillary.projectedAncillarySpend.replace("$", "").split("→")[0]),
      projected: parseFloat(selectedAncillary.projectedAncillarySpend.replace("$", "").split("→")[1]),
    },
    {
      name: "TRevPAR",
      current: parseFloat(selectedAncillary.projectedTrevpar.replace("$", "").split("→")[0]),
      projected: parseFloat(selectedAncillary.projectedTrevpar.replace("$", "").split("→")[1]),
    },
  ];

  return (
    <div style={styles.page}>
      <style>{css}</style>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        style={styles.wrapper}
      >
        <div className="hero-card">
          <div className="hero-overlay" />
          <div className="hero-content">
            <div>
              <div className="eyebrow">Heritage Hue Hotel</div>
              <h1 className="hero-title">Hotel Revenue Forecast & Recommendation</h1>
              <p className="hero-subtitle">
                Dashboard tối ưu doanh thu tháng 1 theo ngày thường và cuối tuần,
                kết hợp đề xuất phòng và dịch vụ bổ trợ.
              </p>
            </div>

            <div className="hero-buttons">
              <button
                className={`main-btn ${selectedMode === "forecast" ? "active" : ""}`}
                onClick={() => setSelectedMode("forecast")}
              >
                Dự báo tổng quan
              </button>
              <button
                className={`main-btn ${selectedMode === "recommendation" ? "active" : ""}`}
                onClick={() => setSelectedMode("recommendation")}
              >
                Đề xuất theo ngày
              </button>
            </div>
          </div>
        </div>

        {selectedMode === "forecast" && (
          <motion.div
            key="forecast"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="section"
          >
            <div className="grid-4">
              <div className="soft-card">
                <div className="metric-label">Tổng doanh thu tháng 1</div>
                <div className="metric-value">{currency(monthData[monthData.length - 1].total_revenue)}</div>
              </div>
              <div className="soft-card">
                <div className="metric-label">Room revenue tháng 1</div>
                <div className="metric-value">{currency(monthData[monthData.length - 1].room_revenue)}</div>
              </div>
              <div className="soft-card">
                <div className="metric-label">Ancillary revenue tháng 1</div>
                <div className="metric-value">{currency(monthData[monthData.length - 1].ancillary_revenue)}</div>
              </div>
              <div className="soft-card">
                <div className="metric-label">Độ tin cậy tham chiếu</div>
                <div className="metric-value">{selectedRoom.confidence}%</div>
              </div>
            </div>

            <div className="glass-card big-card">
              <div className="section-header">
                <h2>Xu hướng doanh thu theo tháng</h2>
                <p>Room revenue vẫn là nguồn chính, nhưng ancillary còn nhiều dư địa để tăng thêm.</p>
              </div>
              <div style={{ width: "100%", height: 380 }}>
                <ResponsiveContainer>
                  <LineChart data={monthData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d7eaf0" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="room_revenue" stroke="#0f3d57" strokeWidth={3} />
                    <Line type="monotone" dataKey="ancillary_revenue" stroke="#34a0a4" strokeWidth={3} />
                    <Line type="monotone" dataKey="total_revenue" stroke="#8ecae6" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        )}

        {selectedMode === "recommendation" && (
          <motion.div
            key="recommendation"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="section"
          >
            <div className="toolbar">
              <div className="button-row">
                <button
                  className={`pill-btn ${selectedDayType === "Weekday" ? "active" : ""}`}
                  onClick={() => {
                    setSelectedDayType("Weekday");
                    setSelectedRoomType("Standard");
                    setSelectedSegment("Corporate");
                  }}
                >
                  Ngày thường
                </button>
                <button
                  className={`pill-btn ${selectedDayType === "Weekend" ? "active" : ""}`}
                  onClick={() => {
                    setSelectedDayType("Weekend");
                    setSelectedRoomType("Standard");
                    setSelectedSegment("Corporate");
                  }}
                >
                  Cuối tuần
                </button>
              </div>

              <div className="button-row">
                <button
                  className={`pill-btn ${selectedSubTab === "room" ? "active" : ""}`}
                  onClick={() => setSelectedSubTab("room")}
                >
                  Đề xuất phòng
                </button>
                <button
                  className={`pill-btn ${selectedSubTab === "ancillary" ? "active" : ""}`}
                  onClick={() => setSelectedSubTab("ancillary")}
                >
                  Dịch vụ bổ trợ
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {selectedSubTab === "room" && (
                <motion.div
                  key="room-tab"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="selection-grid">
                    {roomOptions.map((room) => (
                      <button
                        key={room.roomType}
                        className={`select-card ${selectedRoomType === room.roomType ? "active" : ""}`}
                        onClick={() => setSelectedRoomType(room.roomType)}
                      >
                        <div className="select-title">{room.roomType}</div>
                        <div className="select-sub">Còn khoảng {kpiValue(room.availableRooms)} phòng/ngày</div>
                      </button>
                    ))}
                  </div>

                  <div className="grid-2">
                    <div className="glass-card detail-card">
                      <div className="section-header">
                        <h2>{selectedRoom.roomType} - Đề xuất chi tiết</h2>
                        <p>Đề xuất riêng cho Heritage Hue Hotel</p>
                      </div>

                      <div className="detail-grid">
                        <div className="info-pill">
                          <span>ADR hiện tại</span>
                          <strong>{currency(selectedRoom.currentAdr)}</strong>
                        </div>
                        <div className="info-pill">
                          <span>ADR đề xuất</span>
                          <strong>{currency(selectedRoom.recommendedAdr)}</strong>
                        </div>
                        <div className="info-pill">
                          <span>Target occupancy</span>
                          <strong>{selectedRoom.targetOccupancy}%</strong>
                        </div>
                        <div className="info-pill">
                          <span>Confidence</span>
                          <strong>{selectedRoom.confidence}%</strong>
                        </div>
                      </div>

                      <div className="note-box">
                        <p><strong>Nên bán cho ai:</strong> {selectedRoom.targetSegment}</p>
                        <p><strong>Projected RevPAR:</strong> {currency(selectedRoom.revparProjected)}</p>
                        <p><strong>Projected TRevPAR:</strong> {currency(selectedRoom.trevparProjected)}</p>
                      </div>

                      <div className="note-box emphasis">
                        <strong>Note lý do</strong>
                        <p>{selectedRoom.note}</p>
                      </div>
                    </div>

                    <div className="glass-card detail-card">
                      <div className="section-header">
                        <h2>So sánh KPI dự kiến</h2>
                        <p>Kịch bản sau khi áp dụng đề xuất</p>
                      </div>
                      <div style={{ width: "100%", height: 320 }}>
                        <ResponsiveContainer>
                          <BarChart
                            data={[
                              {
                                name: "Đề xuất",
                                ADR: selectedRoom.recommendedAdr,
                                RevPAR: selectedRoom.revparProjected,
                                TRevPAR: selectedRoom.trevparProjected,
                              },
                            ]}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#d7eaf0" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="ADR" fill="#0f3d57" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="RevPAR" fill="#168aad" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="TRevPAR" fill="#76c893" radius={[8, 8, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {selectedSubTab === "ancillary" && (
                <motion.div
                  key="ancillary-tab"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="selection-grid">
                    {ancillaryOptions.map((segment) => (
                      <button
                        key={segment.segment}
                        className={`select-card ${selectedSegment === segment.segment ? "active" : ""}`}
                        onClick={() => setSelectedSegment(segment.segment)}
                      >
                        <div className="select-title">{segment.segment}</div>
                        <div className="select-sub">{segment.characteristics}</div>
                      </button>
                    ))}
                  </div>

                  <div className="grid-2">
                    <div className="glass-card detail-card">
                      <div className="section-header">
                        <h2>{selectedAncillary.segment} - Dịch vụ bổ trợ</h2>
                        <p>Gợi ý bán thêm theo phân khúc và loại ngày</p>
                      </div>

                      <div className="note-box">
                        <strong>Đặc điểm phân khúc</strong>
                        <p>{selectedAncillary.characteristics}</p>
                      </div>

                      <div className="note-box">
                        <strong>Nên bán dịch vụ nào</strong>
                        <p>{selectedAncillary.recommendedServices}</p>
                      </div>

                      <div className="note-box">
                        <strong>Khi nào nên giảm giá để vẫn lời</strong>
                        <p>{selectedAncillary.discountRule}</p>
                      </div>

                      <div className="note-box emphasis">
                        <strong>Viễn cảnh sau khi làm</strong>
                        <p>Attach rate: {selectedAncillary.projectedAttachRate}</p>
                        <p>Ancillary spend: {selectedAncillary.projectedAncillarySpend}</p>
                        <p>TRevPAR: {selectedAncillary.projectedTrevpar}</p>
                      </div>
                    </div>

                    <div className="glass-card detail-card">
                      <div className="section-header">
                        <h2>Kịch bản hiệu quả dịch vụ</h2>
                        <p>So sánh hiện tại và sau khi triển khai</p>
                      </div>

                      <div style={{ width: "100%", height: 320 }}>
                        <ResponsiveContainer>
                          <BarChart data={ancillaryScenarioData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#d7eaf0" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="current" fill="#8ecae6" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="projected" fill="#2a9d8f" radius={[8, 8, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(135deg, #e8f7f5 0%, #d9f0ef 35%, #d6eef8 100%)",
    padding: "24px",
  },
  wrapper: {
    maxWidth: "1280px",
    margin: "0 auto",
  },
};

const css = `
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #143642;
}

.hero-card {
  position: relative;
  overflow: hidden;
  border-radius: 34px;
  min-height: 280px;
  background: linear-gradient(135deg, #2a9d8f 0%, #52b69a 45%, #76c893 100%);
  box-shadow: 0 18px 50px rgba(55, 140, 130, 0.16);
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at top right, rgba(255,255,255,0.28), transparent 35%),
    radial-gradient(circle at bottom left, rgba(255,255,255,0.18), transparent 30%);
}

.hero-content {
  position: relative;
  z-index: 1;
  padding: 36px;
}

.eyebrow {
  display: inline-block;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(255,255,255,0.22);
  color: white;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  backdrop-filter: blur(6px);
}

.hero-title {
  margin: 18px 0 0 0;
  font-size: 42px;
  line-height: 1.12;
  color: white;
}

.hero-subtitle {
  margin: 14px 0 0 0;
  max-width: 760px;
  color: rgba(255,255,255,0.9);
  line-height: 1.7;
  font-size: 15px;
}

.hero-buttons {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 26px;
}

.main-btn,
.pill-btn,
.select-card {
  border: none;
  cursor: pointer;
  font: inherit;
}

.main-btn {
  padding: 15px 22px;
  border-radius: 18px;
  background: rgba(255,255,255,0.18);
  color: white;
  font-weight: 700;
  transition: 0.25s;
  backdrop-filter: blur(10px);
  box-shadow: 0 6px 18px rgba(0,0,0,0.08);
}

.main-btn:hover {
  transform: translateY(-2px);
  background: rgba(255,255,255,0.28);
}

.main-btn.active {
  background: white;
  color: #1d5f61;
}

.section {
  margin-top: 24px;
}

.grid-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18px;
  margin-bottom: 20px;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 20px;
}

.soft-card,
.glass-card {
  border-radius: 28px;
}

.soft-card {
  padding: 20px;
  background: rgba(255,255,255,0.8);
  border: 1px solid rgba(255,255,255,0.75);
  box-shadow: 0 10px 30px rgba(94, 144, 153, 0.08);
}

.glass-card {
  padding: 24px;
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(255,255,255,0.75);
  backdrop-filter: blur(10px);
  box-shadow: 0 14px 38px rgba(94, 144, 153, 0.08);
}

.big-card {
  margin-top: 8px;
}

.metric-label {
  color: #5d7d85;
  font-size: 14px;
}

.metric-value {
  margin-top: 10px;
  font-size: 28px;
  font-weight: 700;
  color: #163a45;
}

.section-header h2 {
  margin: 0;
  font-size: 24px;
  color: #163a45;
}

.section-header p {
  margin: 8px 0 0 0;
  color: #6b8790;
  line-height: 1.6;
  font-size: 14px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.button-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.pill-btn {
  padding: 13px 20px;
  border-radius: 18px;
  background: rgba(255,255,255,0.88);
  color: #27575f;
  font-weight: 700;
  box-shadow: 0 8px 20px rgba(94, 144, 153, 0.08);
  transition: 0.25s;
}

.pill-btn:hover {
  transform: translateY(-2px);
}

.pill-btn.active {
  background: #2a9d8f;
  color: white;
}

.selection-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin-top: 14px;
}

.select-card {
  text-align: left;
  padding: 20px;
  border-radius: 24px;
  background: rgba(255,255,255,0.84);
  border: 1px solid rgba(255,255,255,0.75);
  box-shadow: 0 10px 24px rgba(94, 144, 153, 0.08);
  transition: 0.25s;
}

.select-card:hover {
  transform: translateY(-4px);
}

.select-card.active {
  background: linear-gradient(135deg, #d8f3dc 0%, #c7eceb 100%);
  border: 1px solid #96d6c5;
}

.select-title {
  font-size: 19px;
  font-weight: 700;
  color: #173b45;
}

.select-sub {
  margin-top: 8px;
  color: #627e87;
  line-height: 1.6;
  font-size: 14px;
}

.detail-card {
  min-height: 100%;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 18px;
}

.info-pill {
  background: #f1fbfa;
  border: 1px solid #dcefee;
  border-radius: 18px;
  padding: 16px;
}

.info-pill span {
  display: block;
  font-size: 12px;
  color: #6b8790;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.info-pill strong {
  display: block;
  margin-top: 8px;
  font-size: 20px;
  color: #173b45;
}

.note-box {
  margin-top: 16px;
  padding: 18px;
  border-radius: 20px;
  background: #f8fdfd;
  border: 1px solid #dcefee;
}

.note-box p {
  margin: 6px 0;
  line-height: 1.7;
  color: #5f7b84;
}

.note-box strong {
  color: #173b45;
}

.note-box.emphasis {
  background: linear-gradient(135deg, #edfdf8 0%, #eef8ff 100%);
}

@media (max-width: 1100px) {
  .grid-4 {
    grid-template-columns: repeat(2, 1fr);
  }

  .grid-2 {
    grid-template-columns: 1fr;
  }

  .selection-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .hero-content {
    padding: 24px;
  }

  .hero-title {
    font-size: 30px;
  }

  .grid-4 {
    grid-template-columns: 1fr;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }
}
`;