import { useMemo, useState } from "react";
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
  monthOverview: {
    "Heritage Hue Hotel": [
      { month: "2025-07", total_revenue: 53619.22, room_revenue: 43122.62, ancillary_revenue: 10496.6 },
      { month: "2025-08", total_revenue: 119034.74, room_revenue: 95447.97, ancillary_revenue: 23586.77 },
      { month: "2025-09", total_revenue: 152712.84, room_revenue: 122965.75, ancillary_revenue: 29747.09 },
      { month: "2025-10", total_revenue: 157017.97, room_revenue: 127182.17, ancillary_revenue: 29835.8 },
      { month: "2025-11", total_revenue: 189171.04, room_revenue: 157529.61, ancillary_revenue: 31641.43 },
      { month: "2025-12", total_revenue: 180388.79, room_revenue: 149348.81, ancillary_revenue: 31039.98 },
      { month: "2026-01", total_revenue: 114387.37, room_revenue: 90573.21, ancillary_revenue: 23814.16 },
    ],
    "Seaside Da Nang Hotel": [
      { month: "2025-07", total_revenue: 70891.19, room_revenue: 56003.36, ancillary_revenue: 14887.83 },
      { month: "2025-08", total_revenue: 180496.54, room_revenue: 142613.89, ancillary_revenue: 37882.65 },
      { month: "2025-09", total_revenue: 222379.9, room_revenue: 176735.02, ancillary_revenue: 45644.88 },
      { month: "2025-10", total_revenue: 283785.11, room_revenue: 234612.9, ancillary_revenue: 49172.21 },
      { month: "2025-11", total_revenue: 293414.26, room_revenue: 243538.06, ancillary_revenue: 49876.2 },
      { month: "2025-12", total_revenue: 317850.48, room_revenue: 262280.88, ancillary_revenue: 55569.6 },
      { month: "2026-01", total_revenue: 204779.43, room_revenue: 168289.32, ancillary_revenue: 36490.11 },
    ],
  },
  recommendations: {
    "Heritage Hue Hotel": {
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
          note: "Ngày thường tồn phòng còn rộng nên nên ưu tiên kéo occupancy bằng weekday value rate và long-stay package.",
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
          note: "Giữ giá tương đối ổn định, cộng thêm credit F&B để tăng chuyển đổi mà không giảm giá quá sâu.",
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
    "Seaside Da Nang Hotel": {
      Weekday: [
        {
          roomType: "Standard",
          availableRooms: 43.4,
          currentAdr: 86.32,
          recommendedAdr: 83.73,
          targetSegment: "Corporate / Long-stay",
          targetOccupancy: 44.5,
          revparProjected: 37.26,
          trevparProjected: 48.66,
          confidence: 95.0,
          note: "Standard tồn nhiều nên weekday nên ưu tiên lấp phòng hơn là đẩy giá.",
        },
        {
          roomType: "Deluxe",
          availableRooms: 20.9,
          currentAdr: 136.7,
          recommendedAdr: 138.06,
          targetSegment: "Corporate + Bleisure",
          targetOccupancy: 54.1,
          revparProjected: 74.69,
          trevparProjected: 88.65,
          confidence: 91.9,
          note: "Deluxe phù hợp giữ giá, cộng benefit mềm để tăng conversion.",
        },
        {
          roomType: "Suite",
          availableRooms: 2.1,
          currentAdr: 219.77,
          recommendedAdr: 224.16,
          targetSegment: "Executive / premium corporate",
          targetOccupancy: 81.7,
          revparProjected: 183.16,
          trevparProjected: 202.58,
          confidence: 88.1,
          note: "Suite đã có occupancy cao, không nên giảm giá mạnh.",
        },
      ],
      Weekend: [
        {
          roomType: "Standard",
          availableRooms: 43.9,
          currentAdr: 90.01,
          recommendedAdr: 91.81,
          targetSegment: "Leisure / Family",
          targetOccupancy: 41.8,
          revparProjected: 38.39,
          trevparProjected: 50.79,
          confidence: 95.0,
          note: "Cuối tuần vẫn còn nhiều Standard nên tăng giá nhẹ và bán bundle.",
        },
        {
          roomType: "Deluxe",
          availableRooms: 19.5,
          currentAdr: 143.47,
          recommendedAdr: 150.64,
          targetSegment: "Leisure couple / direct booker",
          targetOccupancy: 55.6,
          revparProjected: 83.83,
          trevparProjected: 100.16,
          confidence: 86.8,
          note: "Đây là room type tốt để tối ưu ADR cuối tuần.",
        },
        {
          roomType: "Suite",
          availableRooms: 3.5,
          currentAdr: 209.33,
          recommendedAdr: 221.89,
          targetSegment: "Premium leisure",
          targetOccupancy: 66.7,
          revparProjected: 147.92,
          trevparProjected: 168.06,
          confidence: 85.1,
          note: "Suite cuối tuần phù hợp chiến lược premium packaging.",
        },
      ],
    },
  },
};

function currency(v) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(v || 0);
}

export default function App() {
  const hotels = Object.keys(data.monthOverview);
  const [selectedHotel, setSelectedHotel] = useState(hotels[0]);
  const [selectedMode, setSelectedMode] = useState("forecast");
  const [selectedDayType, setSelectedDayType] = useState("Weekday");
  const [selectedRoomType, setSelectedRoomType] = useState("Standard");

  const monthData = data.monthOverview[selectedHotel];
  const roomOptions = data.recommendations[selectedHotel][selectedDayType];

  const selectedRoom = useMemo(() => {
    return (
      roomOptions.find((r) => r.roomType === selectedRoomType) || roomOptions[0]
    );
  }, [roomOptions, selectedRoomType]);

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">Hotel Revenue Forecast & Recommendation</h1>
        <p className="subtitle">
          Dashboard dự báo và đề xuất tối ưu doanh thu tháng 1 theo ngày thường
          và cuối tuần.
        </p>

        <div className="button-row" style={{ marginTop: 20 }}>
          {hotels.map((hotel) => (
            <button
              key={hotel}
              className={`btn ${selectedHotel === hotel ? "active" : ""}`}
              onClick={() => {
                setSelectedHotel(hotel);
                setSelectedRoomType("Standard");
              }}
            >
              {hotel}
            </button>
          ))}
        </div>
      </div>

      <div className="tab-row" style={{ marginTop: 20 }}>
        <button
          className={`btn ${selectedMode === "forecast" ? "active" : ""}`}
          onClick={() => setSelectedMode("forecast")}
        >
          Dự báo tổng quan
        </button>
        <button
          className={`btn ${selectedMode === "recommendation" ? "active" : ""}`}
          onClick={() => setSelectedMode("recommendation")}
        >
          Đề xuất theo ngày
        </button>
      </div>

      {selectedMode === "forecast" && (
        <div className="grid" style={{ marginTop: 20 }}>
          <div className="grid-4">
            <div className="card">
              <div className="metric-label">Tổng doanh thu tháng 1</div>
              <div className="metric-value">
                {currency(monthData[monthData.length - 1].total_revenue)}
              </div>
            </div>
            <div className="card">
              <div className="metric-label">Room revenue tháng 1</div>
              <div className="metric-value">
                {currency(monthData[monthData.length - 1].room_revenue)}
              </div>
            </div>
            <div className="card">
              <div className="metric-label">Ancillary revenue tháng 1</div>
              <div className="metric-value">
                {currency(monthData[monthData.length - 1].ancillary_revenue)}
              </div>
            </div>
            <div className="card">
              <div className="metric-label">Độ tin cậy tham chiếu</div>
              <div className="metric-value">{selectedRoom.confidence}%</div>
            </div>
          </div>

          <div className="card">
            <h2>Xu hướng doanh thu theo tháng</h2>
            <div style={{ width: "100%", height: 380 }}>
              <ResponsiveContainer>
                <LineChart data={monthData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="room_revenue" stroke="#0f172a" />
                  <Line type="monotone" dataKey="ancillary_revenue" stroke="#64748b" />
                  <Line type="monotone" dataKey="total_revenue" stroke="#94a3b8" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {selectedMode === "recommendation" && (
        <div className="grid" style={{ marginTop: 20 }}>
          <div className="button-row">
            <button
              className={`btn ${selectedDayType === "Weekday" ? "active" : ""}`}
              onClick={() => {
                setSelectedDayType("Weekday");
                setSelectedRoomType("Standard");
              }}
            >
              Ngày thường
            </button>
            <button
              className={`btn ${selectedDayType === "Weekend" ? "active" : ""}`}
              onClick={() => {
                setSelectedDayType("Weekend");
                setSelectedRoomType("Standard");
              }}
            >
              Cuối tuần
            </button>
          </div>

          <div>
            <span className="badge">
              {selectedDayType === "Weekday"
                ? "Chiến lược: kéo occupancy"
                : "Chiến lược: kéo ADR + ancillary"}
            </span>
          </div>

          <div className="grid-3">
            {roomOptions.map((room) => (
              <div
                key={room.roomType}
                className={`room-card ${
                  selectedRoomType === room.roomType ? "active" : ""
                }`}
                onClick={() => setSelectedRoomType(room.roomType)}
              >
                <h3>{room.roomType}</h3>
                <p>Còn khoảng {room.availableRooms} phòng/ngày</p>
              </div>
            ))}
          </div>

          <div className="grid-2">
            <div className="card">
              <h2>{selectedRoom.roomType} - Đề xuất chi tiết</h2>
              <p><strong>ADR hiện tại:</strong> {currency(selectedRoom.currentAdr)}</p>
              <p><strong>ADR đề xuất:</strong> {currency(selectedRoom.recommendedAdr)}</p>
              <p><strong>Nên bán cho ai:</strong> {selectedRoom.targetSegment}</p>
              <p><strong>Target occupancy:</strong> {selectedRoom.targetOccupancy}%</p>
              <p><strong>Projected RevPAR:</strong> {currency(selectedRoom.revparProjected)}</p>
              <p><strong>Projected TRevPAR:</strong> {currency(selectedRoom.trevparProjected)}</p>
              <p><strong>Độ tin cậy:</strong> {selectedRoom.confidence}%</p>

              <div className="note-box" style={{ marginTop: 16 }}>
                <strong>Note lý do:</strong>
                <p style={{ marginTop: 8 }}>{selectedRoom.note}</p>
              </div>
            </div>

            <div className="card">
              <h2>So sánh KPI dự kiến</h2>
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
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="ADR" fill="#0f172a" />
                    <Bar dataKey="RevPAR" fill="#475569" />
                    <Bar dataKey="TRevPAR" fill="#94a3b8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}