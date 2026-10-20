import { PrismaClient } from "@prisma/client";
import { partOf } from "./core";
const examples = [
  {
    prompt: "The new employee orientation will begin _____ at nine o’clock.",
    options: ["promptly", "prompt", "promptness", "prompting"],
    answer: "A",
    explanation:
      "“Promptly” là trạng từ bổ nghĩa cho động từ “begin”: bắt đầu đúng giờ.",
  },
  {
    prompt: "Please submit your expense report _____ Friday afternoon.",
    options: ["by", "at", "on to", "during of"],
    answer: "A",
    explanation: "“By + mốc thời gian” nghĩa là không muộn hơn thời điểm đó.",
  },
  {
    prompt: "The marketing team is _____ for organizing the annual conference.",
    options: ["responsibility", "responsible", "responsibly", "respond"],
    answer: "B",
    explanation:
      "Cấu trúc “be responsible for + V-ing”: chịu trách nhiệm làm gì.",
  },
  {
    prompt: "Customers may return the product if they are not _____ satisfied.",
    options: ["complete", "completion", "completely", "completing"],
    answer: "C",
    explanation: "Cần trạng từ “completely” bổ nghĩa cho “satisfied”.",
  },
  {
    prompt: "Ms. Kim has worked in the accounting department _____ 2019.",
    options: ["for", "since", "during", "until"],
    answer: "B",
    explanation: "Thì hiện tại hoàn thành với “since + mốc thời gian”.",
  },
];
export async function seed(db: PrismaClient) {
  if (await db.test.count()) return;
  for (let t = 1; t <= 3; t++) {
    const id = `sample-${t}`;
    await db.test.create({
      data: {
        id,
        title: `Studio Practice · Test 0${t}`,
        year: 2026,
        collection: "Studio Originals",
        description:
          "Đề mẫu tự soạn để kiểm thử · Không phải đề ETS chính thức",
        questions: {
          create: Array.from({ length: 200 }, (_, i) => {
            const number = i + 1,
              part = partOf(number);
            const base = examples[(i + t - 1) % examples.length];
            const groupId =
              part === 3
                ? `p3-${Math.floor((number - 32) / 3)}`
                : part === 4
                  ? `p4-${Math.floor((number - 71) / 3)}`
                  : part === 6
                    ? `p6-${Math.floor((number - 131) / 4)}`
                    : part === 7
                      ? `p7-${Math.floor((number - 147) / 3)}`
                      : `q-${number}`;
            const reading =
              "NORTHLINE WORKSPACES\n\nTo: All team members\nFrom: Maya Chen, Office Manager\nSubject: A better place to work\n\nOur renovated Riverside office will open on Monday, October 26. The new space includes quiet work areas, six meeting rooms, and a shared kitchen.\n\nPlease collect your access card from reception before Friday. Staff who need a parking permit should email the facilities team. A welcome breakfast will be served at 8:30 a.m. on opening day.\n\nThank you for your patience during the renovation. We look forward to welcoming you!";
            return {
              id: `${id}-q${number}`,
              number,
              part,
              groupId,
              prompt:
                part <= 4
                  ? part === 1
                    ? "Look at the illustration. Which statement best describes the scene?"
                    : part === 2
                      ? "Listen to the question and choose the best response."
                      : "What are the speakers discussing?"
                  : part === 5
                    ? base.prompt
                    : part === 6
                      ? "Please collect your access card _____ Friday."
                      : "When will the renovated office open?",
              options: JSON.stringify(
                part === 2
                  ? ["Response A", "Response B", "Response C"]
                  : part <= 4
                    ? [
                        "An office opening",
                        "A train schedule",
                        "A restaurant menu",
                        "A delivery problem",
                      ]
                    : part === 5
                      ? base.options
                      : part === 6
                        ? ["before", "between", "throughout", "among"]
                        : [
                            "On October 26",
                            "On Friday afternoon",
                            "In November",
                            "At 9:30 a.m.",
                          ],
              ),
              passage:
                part >= 6
                  ? reading
                  : part <= 4
                    ? "Nội dung Listening mẫu chưa có bản ghi âm. Hãy tải audio và xác nhận mapping trong Quản lý tài liệu."
                    : "Chọn từ hoặc cụm từ thích hợp nhất để hoàn thành câu.",
              image: part === 1 ? "/sample-office.svg" : null,
              answer: part <= 4 ? null : part === 5 ? base.answer : "A",
              confirmed: part >= 5,
              explanation:
                part <= 4
                  ? "Chưa có audio và đáp án được xác nhận."
                  : part === 5
                    ? base.explanation
                    : part === 6
                      ? "“Before Friday” nghĩa là trước thứ Sáu."
                      : "Email ghi rõ văn phòng mở cửa vào Monday, October 26.",
            };
          }),
        },
      },
    });
  }
}
