# TOEIC Studio — Local workspace

Ứng dụng React + TypeScript + Vite, Tailwind, Radix/shadcn-style Button, Lucide, React Router, Zustand; API Express + TypeScript + Prisma + SQLite + Multer + Zod. Không cần tài khoản hay dịch vụ đám mây.

## Chạy trên Windows

Yêu cầu Node.js 22.12 trở lên.

```powershell
npm install
npm run setup
npm run dev
```

Mở http://127.0.0.1:5173. API ở http://127.0.0.1:3001. Lần đầu API tự tạo 3 đề mẫu, mỗi đề 200 câu đúng phân bố 7 Part. Không có nội dung ETS chính thức. Câu mẫu lặp lại để kiểm thử, không phải ngân hàng câu hỏi hoàn chỉnh.

```powershell
npm run build
npm start
```

Sau build, `npm start` phục vụ giao diện và API tại http://127.0.0.1:3001. Chỉ bind loopback. `npm test` kiểm tra cấu trúc đề, chấm điểm và xung đột mapping.

Khi API đang chạy, `npx tsx server/api-smoke.ts` kiểm tra tích hợp database/API, upload và trích text PDF, mapping, khôi phục bài, deadline Reading và tự nộp khi hết giờ. Script chỉ xóa bản ghi QA do chính nó tạo.

## Chức năng

- Dashboard từ dữ liệu thật, bộ lọc đề, luyện toàn đề / Listening / Reading, lịch sử, biểu đồ tỷ lệ đúng, mục tiêu cá nhân, xuất lịch sử JSON.
- Bài làm lưu SQLite, đáp án practice có bản dự phòng localStorage. Đồng hồ tính từ deadline tuyệt đối, không reset khi reload. Luyện tập cho phép vượt thời gian gợi ý; thi thử tự nộp khi hết giờ.
- Navigator, đánh dấu, chuyển câu không mất đáp án, nhóm 3 câu Parts 3/4, nhóm 4 câu Part 6, nhóm đọc Part 7. Hai pane cuộn riêng, thanh chia kéo hoặc dùng phím trái/phải.
- Chấm các câu có answer key được xác nhận; câu bỏ trống có key được tính sai, câu chưa có key không được chấm. Không tự quy đổi sang thang TOEIC 990 khi chưa có bảng quy đổi chuẩn.
- Upload PDF/audio/hình ảnh tối đa 300 MB/file, metadata trong database, file trong uploads. PDF.js trích text để đối chiếu và hiển thị bản gốc bằng canvas (chuyển trang, nhập số trang, zoom); tải theo khoảng byte để hỗ trợ tài liệu lớn. PDF scan gắn nhãn cần OCR.
- Biên tập câu hỏi, lựa chọn, passage, lời giải, hình ảnh và đáp án trên đề mẫu hiện có; đối chiếu PDF bên cạnh. Nhập answer key JSON/CSV hoặc thủ công, yêu cầu xác nhận.
- Audio timeline, nghe thử, start/end/Part/phạm vi/group/thứ tự/khoảng nghỉ. Kiểm tra trùng câu, trùng đoạn cùng file và trùng thứ tự. Không suy luận mapping từ tên file. Luyện tập có controls, phát lại, tốc độ, âm lượng. Thi thử yêu cầu mapping đủ 100 câu; phát trình tự sau thao tác người dùng.

## Các giới hạn hiện tại

- Tệp yêu cầu đầu vào bị ngắt ở mục 8, ngay sau “Listening khoảng”. Phần triển khai dựa trên nội dung nhận được.
- OCR Reading dùng Tesseract.js (English) và PDF.js, xác định số câu 101–200 và nhóm đoạn đọc. Đề luyện hiển thị ảnh gốc cùng các nút A/B/C/D; chưa tái dựng toàn bộ câu hỏi thành văn bản hay bảng HTML. Vị trí thiếu/trùng phải đối chiếu trước khi mở đề.
- OCR Listening dùng cùng bộ đọc nhưng tái dựng được câu hỏi thành văn bản: Part 3–4 có sẵn trong booklet, Part 1 là ảnh (cắt từ trang gốc), Part 2 không in gì nên lấy từ transcript audio. Câu nào OCR chưa đọc được được đánh dấu để người dùng sửa ở tab **Biên tập câu hỏi**; chỗ đó vẫn giữ đủ lựa chọn A–D để bài thi vẫn làm được. Chưa hỗ trợ gộp nhiều PDF.
- Biên tập hiện giữ cố định Part và nhóm chuẩn; chưa có gộp/tách nhóm và đổi Part. Passage lưu văn bản có xuống dòng; tài liệu phức tạp xem bản PDF gốc, chưa có rich-text/table editor.
- Audio Studio dùng FFmpeg/FFprobe và hỗ trợ MP3, WAV, M4A. Thời lượng và nội dung mỗi mapping cần người dùng nghe xác minh. Vị trí Listening lưu khoảng mỗi 2 giây; tải lại cần nhấn tiếp tục. Audio TOEIC thật chưa được cung cấp.
- Thi thử bắt đầu sau xác nhận sẵn sàng; hết trình tự audio chuyển sang Reading với deadline riêng 75 phút, không quay lại Listening. Thời lượng audio thực tế do mapping quyết định. Chưa kiểm thử bằng bộ đề/audio chính thức vì chưa được cung cấp.
- Không có đăng nhập, đồng bộ đám mây hoặc bảo vệ chống gian lận. Chỉ dành cho luyện tập cá nhân tại localhost.

## Sao lưu

Dừng ứng dụng rồi sao chép `prisma/local.db` và thư mục `uploads/` cùng nhau. `.env` đặt `DATABASE_URL="file:./local.db"`. Không xóa database nếu cần giữ lịch sử. Dữ liệu cá nhân trình duyệt có thể xuất từ Cài đặt.

## Kiến trúc mở rộng

Các model Test → Question (Part, groupId, passage, image, confirmed key), Attempt (deadline, answers, flags, status), Document (file gốc, extracted text, review status) và AudioMapping (source/time range/Part/question range/group/sequence/gap) tách biệt. Pipeline import tương lai nên tạo draft, thêm OCR/layout extraction, rồi review nội dung và answer key trước khi publish. Không đưa bản trích chưa xác minh vào đề chính thức.

## Chuyển PDF scan thành đề Reading

Trong Quản lý tài liệu → Chuyển PDF thành đề, chọn PDF rồi cấu hình số đề, số trang mỗi đề và số trang bìa. Pipeline hiện hỗ trợ các đề Reading có cấu trúc trang đồng đều. Nhấn nhận dạng để tạo bản nháp, đối chiếu vị trí được gắn cờ rồi đưa vào luyện tập. Job lưu SQLite; ảnh trang, OCR và các vị trí đã sửa lưu tại `uploads/import-<documentId>/`. Khi khởi động lại máy chủ giữa chừng, dùng nút tiếp tục để chạy từ cache. Mô hình English tải ở lần đầu và lưu `uploads/.ocr-cache/`; các lần sau chạy cục bộ.

Tài liệu 1000 READING đã chuyển thành 10 đề, mỗi đề 100 câu (Part 5:30, Part 6:16, Part 7:54), 75 phút. 36 vị trí bị OCR bỏ sót/trùng đã đối chiếu với bản scan. Các nhóm nhiều trang giữ cả trang tài liệu và trang câu hỏi. Nút zoom, đổi trang và mở ảnh gốc giúp đọc bản scan. Đã đối chiếu và gắn 1.000 đáp án từ PDF đáp án ETS 2024 RC cho 10 đề. Bài nộp được chấm đúng/sai/bỏ trống trên 100 câu, có đáp án để xem lại. Bảng nguồn chưa có lời giải chi tiết hoặc quy đổi điểm TOEIC nên không tự tạo các dữ liệu này.

## Chuyển PDF scan thành đề Listening

Cùng đường dẫn đó, nhưng chọn tab **Listening** (Quản lý tài liệu → Chuyển PDF thành đề → Listening). Booklet TOEIC có cấu trúc khác Reading nên phần này đọc PDF theo đúng cấu trúc Listening:

- Part 3–4 (câu 32–100) in sẵn trong booklet: lấy thân câu và lựa chọn (A)–(D) từ OCR, dựng lại theo toạ độ nên không lẫn hai cột.
- Part 1 (câu 1–6) là **ảnh**: ảnh được tách từ trang gốc bằng cách đo mật độ pixel, nhãn số câu nằm ngay bên trái mép ảnh nên dùng làm tín hiệu phân ảnh. Ảnh hiện thẳng trong câu hỏi.
- Part 2 (câu 7–31) **không in gì** trong booklet — câu hỏi và ba lựa chọn nằm trong audio, nên ứng dụng lấy từ transcript của file audio đã tải (đoán số đề từ tên file, ví dụ `TEST 01.mp3` → Test 01). Chưa có audio thì câu đó để trống cho tới khi bạn thêm audio.
- Số câu đôi khi bị OCR rơi mất (chỉ còn dấu "."): khôi phục theo số câu liền kề trong cột.
- Lựa chọn nào chưa đọc được vẫn giữ đủ chỗ A–D để bài thi làm được, và câu đó được gắn cờ để sửa ở tab Biên tập câu hỏi.

Tài liệu 1000 LISTENING (130 trang, 10 đề × 13 trang) đã chuyển thành 10 đề Listening, mỗi đề 100 câu (6/25/39/30 ở Part 1/2/3/4), kèm 1.000 đáp án từ PDF đáp án ETS 2024 LC. Test 01 đã ghép với `TEST 01.mp3` nên phát được audio và chấm điểm đầy đủ. Việc khớp bộ đáp án với booklet đã được kiểm tra độc lập bằng ảnh Part 1 và nội dung transcript.

Kiểm thử tích hợp dữ liệu đã nhập: `npx tsx server/reading-smoke.ts` (yêu cầu API đang chạy và tài liệu này đã được nhập). Kiểm tra 10 đề/1.000 câu, ảnh nguồn, cấu trúc, nhóm nhiều trang, lưu/khôi phục/nộp bài và deadline Reading. Các bản ghi bài làm QA được xóa sau kiểm thử.


## Audio Segmentation & Mapping

Mở `/admin/audio-editor` hoặc mục **Audio Studio**. Upload MP3/WAV/M4A tối đa 1 GB; file 45 phút được phân tích bằng background job. FFprobe đọc metadata, FFmpeg tạo waveform giảm mẫu và phát hiện khoảng lặng; không nạp toàn bộ PCM vào RAM trình duyệt. File gốc được giữ nguyên, SHA-256 được lưu để kiểm tra mapping.

1. Chờ job phân tích hoàn tất; nhấn **Auto Detect** để đề xuất. Có thể chỉnh ngưỡng dB và độ dài khoảng lặng.
2. Chọn một trong 54 slot (Part 1:6, Part 2:25, Part 3:13, Part 4:10). Kéo vùng/mép waveform hoặc nhập Start/End, đổi nhóm câu liên kết và **Preview**.
3. Khi có transcript timestamp, nhập JSON hoặc chạy Whisper. Chọn PDF nguồn và bộ đề đích để đối chiếu nội dung. PDF scan dùng cache OCR nếu đã có; PDF chưa OCR có thể không có văn bản để so khớp. Mốc số câu và từ khóa chỉ là gợi ý; không khẳng định audio khớp PDF.
4. Nghe kiểm tra rồi xác nhận từng đoạn. Thiếu nhóm, trùng liên kết, chồng lấn hoặc sai thứ tự sẽ chặn xuất bản. Khoảng không gán được báo riêng để xem xét. Đủ 54 khoảng lặng **không phải bằng chứng mapping đúng**; đề xuất silence-only chỉ có độ tin cậy thấp và không tự xác nhận.
5. **Save Mapping** lưu SQLite (cũng tự lưu). JSON nhập lại luôn bỏ xác nhận; SHA-256/thời lượng khác bị từ chối. Khi tải lại, bản nháp, job, slot, zoom và con trỏ được khôi phục. Job bị ngắt khi khởi động lại chuyển sang trạng thái tạm dừng để tiếp tục từ nguồn.
6. **Split MP3** xuất slot đang chọn; **Export Segments MP3** xuất các đoạn có thời gian hợp lệ thành MP3 và ZIP kèm manifest. Không cần cắt vật lý để luyện: mapping lưu start/end. Khi thi nghiêm ngặt, audio gốc chạy liên tục, giữ cả chỉ dẫn và khoảng nghỉ; nhóm câu theo vị trí phát thực tế. Chỉ mapping đủ 54 nhóm đã xác nhận mới được xuất bản vào bộ đề Listening.

### Mốc số câu và cách tách 54 nhóm

Audio TOEIC thật công bố câu ở đầu đoạn thoại, nên transcript là nguồn ranh giới đáng tin hơn khoảng lặng:

- Part 1–2 công bố từng câu: `Number 1.`, `Number 2.` … (mỗi câu một nhóm).
- Part 3–4 công bố cả nhóm: `Questions 32 through 34 refer to the following conversation.` (3 câu/nhóm).
- Chỉ mốc **đứng đầu câu** mới được tính. Số nói trong lời thoại (`van number five`) là số đếm, không phải mốc câu hỏi — nếu tính nhầm, file bị chia thành nhiều "đề" và chỉ map được một phần.
- Một file chỉ bị coi là nhiều đề khi số câu bắt đầu lại từ đầu Part 1 và các câu sau tăng đền. Một số đếm nói trong lời thoại không tạo được ranh giới đề.
- Nhóm 1 bắt đầu đúng tại mốc `Number 1.`, không nuốt phần bản quyền và hướng dẫn đầu file. Ranh giới cuối của nhóm cuối mỗi Part cắt tại khoảng ngừng chuyển phần nên không nuốt hướng dẫn của Part sau; khoảng hướng dẫn đó được báo ở mục "khoảng thời gian chưa gán".
- Không có transcript thì Auto Detect vẫn chạy bằng khoảng lặng, nhưng đề xuất chỉ có độ tin cậy thấp (`silence-only`) và phải nghe kiểm tra.

Đã kiểm chứng trên một file đề TOEIC thật (`TEST 01.mp3`, 2752.5s, 54 nhóm): Auto Detect ra 1 đề, đủ 54/54 nhóm có khoảng thời gian, không chồng lấn, đúng thứ tự; mỗi nhóm mở đầu đúng mốc số câu và chứa đủ các câu của nhóm. Bốn khoảng chưa gán là phần bản quyền/hướng dẫn đầu file và hướng dẫn chuyển Part (275.2–303.2s, 816.4–846.8s, 1922.5–1951.9s). Export ra 54 MP3 khớp độ dài mapping và nghe đúng nội dung.

### Whisper tùy chọn, chạy cục bộ

FFmpeg/FFprobe đi kèm npm. Không cần API trả phí. Whisper dùng `faster-whisper`, CPU int8, tối đa 4 luồng; có thể bỏ qua hoàn toàn và nhập transcript JSON. Lần đầu tải model từ Hugging Face (cần Internet); nhận dạng audio chạy trên máy. Tiny/base phù hợp máy ít tài nguyên hơn small; tốc độ phụ thuộc CPU và audio 45 phút có thể xử lý lâu hơn thời gian phát. Cần đủ RAM và dung lượng cho model/cache. Máy hiện tại đã kiểm thử `tiny.en` bằng giọng nói mẫu.

```powershell
py -3.10 -m venv .audio-venv
.audio-venv\Scripts\python.exe -m pip install faster-whisper
```

Ứng dụng tự tìm `.audio-venv/Scripts/python.exe` (hoặc `.audio-venv/bin/python`). Có thể đặt `WHISPER_PYTHON` để dùng Python khác, `FFMPEG_PATH` / `FFPROBE_PATH` để dùng binary khác. Model lưu tại `uploads/.whisper-models/`.

Transcript JSON: `[{"start":1.2,"end":4.5,"text":"Question one ..."}]`. Có thể thêm `words:[{"start":1.2,"end":1.7,"word":"Question"}]` để mốc câu chính xác hơn. Timestamp cần nằm trong thời lượng file.

### Backend và kiểm thử audio

Model SQLite: `AudioProject`, `AudioSegment`, `AudioJob`; `AudioMapping` đã xuất bản liên kết vào luồng luyện/thi hiện có. API gốc `/api/audio`: `system`, `upload`, `projects`, `projects/:id`, `draft` (PUT, optimistic revision), `view` (PUT), `detect`, `transcribe`, `transcript` (PUT), `mapping.json`, `import-mapping`, `export`, `publish`, `jobs/:id/resume`. Các thao tác xử lý nặng trả job và frontend polling tiến độ/lỗi. File dẫn xuất lưu `uploads/audio-work/<projectId>/`.

- `npm test`: kiểm tra cấu trúc, xác thực mapping và đề xuất timestamp/silence cùng các unit test hiện có.
- `npm run test:audio`: yêu cầu localhost API; sinh MP3 tone 45 phút, WAV/M4A và kiểm tra upload, peaks, silence, draft, xung đột revision, JSON/hash, xác nhận/xuất bản, MP3/ZIP, Whisper nếu cài, lỗi file và tiếp tục job. Tạo bộ đề QA riêng và dọn bản ghi QA sau chạy. Giữ lại demo 45 phút chưa xác nhận để thử giao diện. Đây là tone kiểm thử, không phải đề TOEIC.
- `npx tsx server/api-smoke.ts` và `npx tsx server/reading-smoke.ts`: hồi quy API và dữ liệu Reading hiện có.

Kết quả kiểm thử audio: `artifacts/audio-tests/verification.json`. Chưa có audio TOEIC thật nên chưa xác minh nội dung audio khớp bất kỳ PDF đề thật nào.


## Đáp án ETS 2024 RC / LC đã nhập

10 đề tại `/reading` có tên ETS 2024 · Reading Test 01–10, mỗi đề đủ 100 đáp án. Cấu trúc 30/16/54 câu Part 5/6/7 và bản scan gốc được giữ nguyên. Đáp án được ẩn khi làm bài, chỉ hiện sau khi nộp. Câu bỏ trống tính sai. Chưa có bảng quy đổi xác nhận nên kết quả là số câu đúng và tỷ lệ, không tự suy ra điểm TOEIC.

Tại `/documents?tab=keys`, thư viện đáp án lưu 20 bộ (10 RC đã gắn đề, 10 LC chờ Listening), có link PDF nguồn đúng trang và tải JSON riêng từng Test. LC chưa gán vào các đề Studio mẫu. Cần nội dung Listening tương ứng và audio để hoàn thiện phần Listening sau; không tạo câu hỏi/ảnh/đáp án giả từ audio chưa có.

Model `AnswerKeySet` lưu số Test, section, trang/ô bảng nguồn, SHA-256, 100 đáp án, bộ đề đích và trạng thái áp dụng. Hai PDF gốc được sao chép vào `uploads/answer-keys/`; file nguồn Downloads không thay đổi. Bản sao SQLite trước nhập lưu `artifacts/answer-keys/before-answer-import.db`.

Trích xuất tái lập bằng `scripts/extract-ets2024-keys.py` (PyMuPDF). Dùng vị trí ô bảng và nhãn TEST thay vì thứ tự văn bản của PDF, vì thứ tự có thể khác bố cục. Mỗi bộ bắt buộc đủ 100 số câu duy nhất; Part 2 chỉ nhận A–C. Script `scripts/import-ets2024-keys.ts` kiểm tra hash PDF đề trùng bản đã nhập, từ chối key đã xác nhận xung đột, rồi gắn RC trong một transaction; giữ LC riêng. Không cần chạy lại khi dữ liệu đã nhập.

Kiểm thử `npx tsx server/answer-keys-smoke.ts`: đối chiếu đủ 2.000 đáp án với dữ liệu trích, 10 bài đúng hết đạt 100/100, một sai một bỏ trống đạt 98/100, bài trống 0/100, không lộ key trước nộp, LC vẫn chờ. Chỉ xóa các attempt QA tự tạo. Báo cáo tại `artifacts/answer-keys/verification.json` và `import-report.json`.
