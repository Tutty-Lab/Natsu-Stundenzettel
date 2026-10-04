// Tài liệu viết theo quy tắc ASD-STE100 (Simplified Technical English), áp
// dụng cho tiếng Việt: câu ngắn (hướng dẫn ≤ 20 từ, mô tả ≤ 25 từ), mỗi câu
// một việc, câu mệnh lệnh cho thao tác, thể chủ động, một từ cho một khái niệm
// (xem bảng Thuật ngữ). Cảnh báo đặt TRƯỚC bước thao tác liên quan.

import {
  DAY_WEIGHTS,
  LATE_SHIFT_RATIOS,
  WEEKDAY_LABELS_VI,
  type WeekdayKey,
} from "../lib/demand";
import { AZUBI_HOURS_IN_TERM, AZUBI_HOURS_OUT_OF_TERM, AZUBI_WORKDAYS_IN_TERM } from "../types";

const WEEKDAY_ORDER: WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 rounded-lg bg-white border border-slate-200 p-4 sm:p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900 mb-2">{title}</h2>
      <div className="text-sm text-slate-700 space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}

/** Các bước thao tác, đánh số. Mỗi bước một câu, một việc. */
function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal pl-5 space-y-1">{children}</ol>;
}

/** Cảnh báo: nếu không làm đúng thì mất dữ liệu. */
function Caution({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
      <b>CHÚ Ý:</b> {children}
    </div>
  );
}

/** Ghi chú: thông tin thêm, không có rủi ro. */
function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-600"><b>Ghi chú:</b> {children}</p>;
}

/** Bảng hằng số theo thứ (đọc trực tiếp từ code nên luôn khớp). */
function WeekdayTable({
  values,
  format,
  highlight,
}: {
  values: Record<WeekdayKey, number>;
  format: (v: number) => string;
  highlight: (key: WeekdayKey) => boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse">
        <thead>
          <tr>
            {WEEKDAY_ORDER.map((k) => (
              <th
                key={k}
                className={`border border-slate-200 px-3 py-1 font-medium ${
                  highlight(k) ? "bg-indigo-50 text-indigo-900" : "bg-slate-50 text-slate-600"
                }`}
              >
                {WEEKDAY_LABELS_VI[k]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {WEEKDAY_ORDER.map((k) => (
              <td
                key={k}
                className={`border border-slate-200 px-3 py-1 text-center font-semibold ${
                  highlight(k) ? "bg-indigo-50 text-indigo-900" : ""
                }`}
              >
                {format(values[k])}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const TERMS: Array<[string, string]> = [
  ["Định mức", "Số giờ công một người phải làm trong tháng (Sollstunden)."],
  ["Ca", "Một lần làm việc liên tục trong một ngày, có giờ vào và giờ ra."],
  ["Giờ công", "Giờ được trả lương. Giờ công không gồm giờ nghỉ."],
  ["Nghỉ (Pause)", "30 phút nghỉ trong ca. Ca trên 6 giờ công có Nghỉ. Ca đến 6 giờ công không có Nghỉ."],
  ["Giờ có mặt", "Giờ công cộng Nghỉ. Ví dụ: ca 6,5h công có mặt 7h."],
  ["Mẫu tuần", "Số ngày làm và độ dài ca cố định cho một người trong một tuần."],
  ["Ngày nghỉ cố định", "Thứ trong tuần mà người dùng Mẫu tuần không làm."],
  ["Tuần đủ", "Tuần từ Thứ 2 đến Chủ nhật nằm hết trong tháng."],
  ["Tuần lẻ", "Phần tuần ở đầu hoặc cuối tháng."],
];

const CONTENTS: Array<[string, string]> = [
  ["thuat-ngu", "Thuật ngữ"],
  ["hang-thang", "Quy trình mỗi tháng"],
  ["nhan-vien", "Nhân viên"],
  ["mau-tuan", "Mẫu tuần"],
  ["azubi", "Azubi"],
  ["quy-tac", "Quy tắc xếp lịch"],
  ["ngay", "Ngày lễ và ngày đặc biệt"],
  ["in", "In và xuất file"],
];

export function DocsTab() {
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="rounded-lg bg-slate-900 text-white p-4 sm:p-5">
        <h1 className="text-lg font-semibold">Tài liệu hướng dẫn</h1>
        <p className="text-sm text-slate-300 mt-1">
          Tài liệu này mô tả cách dùng ứng dụng và cách ứng dụng xếp lịch. Các bảng số đọc trực
          tiếp từ mã nguồn. Vì vậy, các bảng luôn đúng với lịch thực tế.
        </p>
        <nav className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {CONTENTS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-slate-200 underline-offset-2 hover:underline">
              {label}
            </a>
          ))}
        </nav>
      </div>

      <Section id="thuat-ngu" title="1. Thuật ngữ">
        <p>Tài liệu và ứng dụng dùng các từ dưới đây với một nghĩa duy nhất.</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {TERMS.map(([term, meaning]) => (
            <div key={term} className="contents">
              <dt className="font-semibold text-slate-900">{term}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="hang-thang" title="2. Quy trình mỗi tháng">
        <Caution>
          Nút „Tạo lịch làm việc“ thay toàn bộ lịch của tháng. Các ca bạn sửa tay sẽ mất. Tạo lịch
          trước, sau đó mới sửa tay.
        </Caution>
        <Steps>
          <li>Chọn tháng và năm ở thanh trên cùng.</li>
          <li>Mở tab Cài đặt. Kiểm tra giờ mở cửa và ngày đặc biệt.</li>
          <li>Mở tab Nhân viên. Kiểm tra định mức, ngày vào làm và ngày thôi làm.</li>
          <li>Mở tab Azubi. Kiểm tra kỳ học, giờ mỗi tuần và ngày học.</li>
          <li>Mở tab Lịch làm việc. Bấm „Tạo lịch làm việc“.</li>
          <li>Kiểm tra ô „Trạng thái kiểm tra“. Ô này phải ghi „Hợp lệ“.</li>
          <li>Sửa tay các ca cần đổi.</li>
          <li>Mở tab Bảng chấm công. In lịch tuần và bảng chấm công.</li>
        </Steps>
        <Note>Mỗi lần bấm „Tạo lịch làm việc“, ứng dụng cho một lịch khác. Mọi lịch đều đúng định mức.</Note>
      </Section>

      <Section id="nhan-vien" title="3. Nhân viên">
        <p className="font-medium text-slate-900">Thêm một nhân viên:</p>
        <Steps>
          <li>Mở tab Nhân viên.</li>
          <li>Bấm „+ Thêm“.</li>
          <li>Nhập tên.</li>
          <li>Chọn hình thức: Toàn thời gian, Bán thời gian hoặc Azubi.</li>
          <li>Nhập số giờ vào ô „Giờ định mức / tháng“.</li>
          <li>Bấm „Lưu“.</li>
        </Steps>
        <p>
          Ngày vào làm, ngày thôi làm, ngày làm trong tuần và Mẫu tuần nằm trong phần „Nâng cao“.
          Phần này đóng khi bạn mở form. Dòng dưới chữ „Nâng cao“ cho biết các cài đặt đang có.
        </p>
        <p className="font-medium text-slate-900 pt-1">Ngày vào làm và ngày thôi làm:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Ứng dụng không xếp ca trước ngày vào làm.</li>
          <li>Ứng dụng không xếp ca sau ngày thôi làm. Ngày thôi làm là ngày làm cuối cùng.</li>
          <li>
            Nếu người đó chỉ làm một phần tháng, ứng dụng giảm định mức theo số ngày làm. Ví dụ:
            định mức 62h, vào làm ngày 17/10 (15 trên 31 ngày), định mức tháng 10 là 30h.
          </li>
          <li>Định mức đã nhập không thay đổi. Tháng sau, ứng dụng dùng lại định mức đầy đủ.</li>
          <li>Để trống hai ô nếu người đó làm cả tháng.</li>
        </ul>
        <p className="font-medium text-slate-900 pt-1">Ngày làm được trong tuần:</p>
        <p>
          Bấm vào một thứ để bỏ thứ đó. Thứ bị gạch là ngày người đó không làm. Mặc định, người đó
          làm được mọi thứ trong tuần.
        </p>
      </Section>

      <Section id="mau-tuan" title="4. Mẫu tuần (lịch tuần cố định)">
        <p>
          Mẫu tuần cho một người một số ngày làm cố định mỗi tuần và một độ dài ca cố định. Mẫu tuần
          chỉ dùng cho Toàn thời gian và Bán thời gian. Azubi có quy tắc riêng.
        </p>
        <p className="font-medium text-slate-900">Mẫu toàn thời gian của quán (40h mỗi tuần):</p>
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="border border-slate-200 px-3 py-1 text-left font-medium">Số ca</th>
                <th className="border border-slate-200 px-3 py-1 text-left font-medium">Giờ công</th>
                <th className="border border-slate-200 px-3 py-1 text-left font-medium">Nghỉ</th>
                <th className="border border-slate-200 px-3 py-1 text-left font-medium">Giờ có mặt</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-200 px-3 py-1">4 ca</td>
                <td className="border border-slate-200 px-3 py-1">6,5h</td>
                <td className="border border-slate-200 px-3 py-1">30 phút</td>
                <td className="border border-slate-200 px-3 py-1">7h</td>
              </tr>
              <tr>
                <td className="border border-slate-200 px-3 py-1">2 ca</td>
                <td className="border border-slate-200 px-3 py-1">7h</td>
                <td className="border border-slate-200 px-3 py-1">30 phút</td>
                <td className="border border-slate-200 px-3 py-1">7,5h</td>
              </tr>
              <tr className="font-semibold">
                <td className="border border-slate-200 px-3 py-1">6 ngày</td>
                <td className="border border-slate-200 px-3 py-1">40h</td>
                <td className="border border-slate-200 px-3 py-1">3h</td>
                <td className="border border-slate-200 px-3 py-1">43h</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="font-medium text-slate-900 pt-1">Dùng mẫu cho một người:</p>
        <Steps>
          <li>Mở tab Nhân viên.</li>
          <li>Bấm vào dòng của người đó.</li>
          <li>Bấm „Nâng cao“.</li>
          <li>Bấm „Dùng mẫu toàn thời gian“.</li>
          <li>Đọc dòng xem trước. Dòng này cho biết số ca, giờ công và giờ có mặt.</li>
          <li>Bấm „Lưu“.</li>
        </Steps>
        <p className="font-medium text-slate-900 pt-1">Dùng mẫu cho cả đội toàn thời gian:</p>
        <Steps>
          <li>Mở tab Nhân viên.</li>
          <li>Bấm „Áp dụng mẫu cho cả đội toàn thời gian“.</li>
          <li>Bấm nút xác nhận.</li>
        </Steps>
        <p className="font-medium text-slate-900 pt-1">Cách ứng dụng xếp Mẫu tuần:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Mỗi người có ngày nghỉ cố định. Bạn có thể chọn ngày nghỉ. Nếu bạn không chọn, ứng dụng tự chọn.</li>
          <li>Ứng dụng chọn ngày nghỉ từ Thứ 2 đến Thứ 5. Ứng dụng chia đều ngày nghỉ cho cả đội.</li>
          <li>Ứng dụng xếp ca dài (7h) vào ngày đông khách nhất.</li>
          <li>Tuần đủ luôn có đúng giờ theo mẫu, ví dụ 40h.</li>
          <li>Tuần lẻ nhận giờ theo số ngày làm trong phần tuần đó. Hai tuần lẻ ở hai tháng cộng lại bằng một tuần đủ.</li>
          <li>Định mức tháng của người dùng mẫu 40h là tổng giờ của các tuần trong tháng.</li>
        </ul>
        <Note>Người dùng Mẫu tuần được xếp trước. Sau đó, ứng dụng xếp những người còn lại.</Note>
      </Section>

      <Section id="azubi" title="5. Azubi">
        <ul className="list-disc pl-5 space-y-1">
          <li>Trong kỳ học: tối đa {AZUBI_HOURS_IN_TERM}h mỗi tuần và {AZUBI_WORKDAYS_IN_TERM} ngày làm.</li>
          <li>Trong kỳ học: chọn đúng 2 ngày học. Ứng dụng không xếp ca vào ngày học.</li>
          <li>Ngoài kỳ học: tối đa {AZUBI_HOURS_OUT_OF_TERM}h mỗi tuần.</li>
        </ul>
        <p className="font-medium text-slate-900 pt-1">Đổi sang nghỉ hè:</p>
        <Steps>
          <li>Mở tab Azubi.</li>
          <li>Bỏ dấu ở ô „Kỳ học“.</li>
          <li>Nhập giờ mỗi tuần.</li>
        </Steps>
        <Note>Dòng chữ màu cam cho biết lỗi. Sửa lỗi trước khi tạo lịch.</Note>
      </Section>

      <Section id="quy-tac" title="6. Quy tắc xếp lịch">
        <p className="font-medium text-slate-900">Ứng dụng luôn giữ các quy tắc sau:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Một người làm tối đa 8 giờ công mỗi ngày.</li>
          <li>Một người làm tối đa một ca mỗi ngày.</li>
          <li>Một người làm tối đa 6 ngày liên tiếp.</li>
          <li>Mỗi người làm đúng định mức. Không thừa và không thiếu.</li>
          <li>Ca dài 4 đến 8 giờ công. Ca của Mẫu tuần dùng bước 30 phút.</li>
        </ul>

        <p className="font-medium text-slate-900 pt-2">Trọng số theo thứ:</p>
        <p>
          Ứng dụng chia tổng giờ công của tháng cho các ngày. Ngày có trọng số cao nhận nhiều giờ
          hơn. Ngày thường có trọng số 1.
        </p>
        <WeekdayTable
          values={DAY_WEIGHTS}
          format={(v) => v.toFixed(2).replace(".", ",")}
          highlight={(k) => DAY_WEIGHTS[k] > 1}
        />
        <p className="text-slate-600">
          Công thức: <code>giờ của ngày = tổng giờ tháng × trọng số ngày ÷ tổng trọng số</code>.
          Ngày đóng cửa có trọng số 0.
        </p>

        <p className="font-medium text-slate-900 pt-2">Tỉ lệ ca tối:</p>
        <p>
          Bảng dưới cho biết phần giờ của ngày dành cho ca tối. Phần còn lại dành cho ca sáng. Ca
          tối luôn đông hơn ca sáng.
        </p>
        <WeekdayTable
          values={LATE_SHIFT_RATIOS}
          format={(v) => Math.round(v * 100) + "%"}
          highlight={(k) => LATE_SHIFT_RATIOS[k] >= 0.7}
        />
        <ul className="list-disc pl-5 space-y-1 text-slate-600">
          <li>Bán thời gian làm ca tối nhiều hơn.</li>
          <li>Toàn thời gian làm ca sáng và ca tối đều nhau.</li>
          <li>Ca sáng bắt đầu khi quán mở. Ca tối kết thúc khi quán đóng.</li>
          <li>Ca chuyển tiếp có thể bắt đầu lúc 15:30. Ca này lấp khoảng giữa ca sáng và ca tối.</li>
          <li>Nếu quán mở ngắn hơn, ca ngắn lại. Ứng dụng bù giờ thiếu vào ngày khác.</li>
        </ul>
      </Section>

      <Section id="ngay" title="7. Ngày lễ và ngày đặc biệt">
        <p>
          Ứng dụng tự tính ngày lễ của bang NRW cho năm đã chọn. Ngày lễ dùng giờ mở cửa và trọng số
          của Chủ nhật. Tab Cài đặt hiện các ngày lễ của tháng.
        </p>
        <p className="font-medium text-slate-900">Đặt một ngày đặc biệt:</p>
        <Steps>
          <li>Mở tab Cài đặt.</li>
          <li>Tìm phần „Ngày đặc biệt“.</li>
          <li>Chọn ngày.</li>
          <li>Chọn „Đóng cửa cả ngày“ hoặc nhập giờ mở cửa riêng.</li>
        </Steps>
        <ul className="list-disc pl-5 space-y-1">
          <li>Ngày đóng cửa: ứng dụng không xếp ca. Giờ của ngày đó chuyển sang ngày khác.</li>
          <li>Ngày có giờ riêng: mọi ca nằm trong giờ mở cửa của ngày đó.</li>
        </ul>
      </Section>

      <Section id="in" title="8. In và xuất file">
        <p className="font-medium text-slate-900">In bảng chấm công:</p>
        <Steps>
          <li>Mở tab Bảng chấm công. Nút „Bảng chấm công“ đã được chọn sẵn.</li>
          <li>Chọn một người, hoặc chọn „Tất cả nhân viên“.</li>
          <li>Chọn „Cả tháng“ hoặc một tuần.</li>
          <li>Bấm „Xuất PDF“ hoặc „In“.</li>
        </Steps>
        <p className="font-medium text-slate-900 pt-1">In lịch làm việc theo tuần:</p>
        <Steps>
          <li>Mở tab Bảng chấm công.</li>
          <li>Bấm „Lịch tuần“.</li>
          <li>Chọn một tuần. Chọn „Cả tháng“ để in mỗi tuần một trang.</li>
          <li>Chọn dạng: „Bảng“ hoặc „Biểu đồ giờ“.</li>
          <li>Bấm „Xuất PDF“ hoặc „In“.</li>
        </Steps>
        <ul className="list-disc pl-5 space-y-1">
          <li>Dạng Bảng: mỗi người một dòng, mỗi ngày một cột. Cột cuối là giờ công của tuần.</li>
          <li>Dạng Biểu đồ giờ: mỗi ngày một khối. Mỗi ca là một thanh từ giờ vào đến giờ ra.</li>
        </ul>
        <Note>
          Tờ Stundenaufzeichnung và lịch tuần dùng tiếng Đức, vì quán nộp các tờ này ở Đức. Tên
          tiếng Việt in không dấu.
        </Note>
        <Note>Khi bấm „In“, chọn lề „Chuẩn“ và tỉ lệ 100 %.</Note>
      </Section>
    </div>
  );
}
