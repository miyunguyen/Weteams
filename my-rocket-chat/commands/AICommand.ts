import {
    IHttp,
    IModify,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import {
    ISlashCommand,
    SlashCommandContext,
} from "@rocket.chat/apps-engine/definition/slashcommands";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { IAppInfo } from "@rocket.chat/apps-engine/definition/metadata";

export class AICommand implements ISlashCommand {
    public command = "weteams-ai";
    public i18nParamsExample = "enter_your_prompt";
    public i18nDescription =
        "Trợ lý AI Weteams: Hỏi đáp, tóm tắt, dịch thuật, lên ý tưởng...";
    public providesPreview = false;

    private readonly appInfo: IAppInfo;

    // Configuration
    private readonly apiBaseEndpoint: string =
        "https://generativelanguage.googleapis.com/v1beta/models";

    constructor(appInfo: IAppInfo) {
        this.appInfo = appInfo;
    }

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
    ): Promise<void> {
        const sender = context.getSender();
        const room = context.getRoom();
        const args = context.getArguments();

        // Lấy yêu cầu thực tế của người dùng
        const userPrompt = args.join(" ").trim();

        if (!userPrompt) {
            await this.sendMessage(
                modify,
                read,
                room,
                sender,
                "Vui lòng cung cấp yêu cầu. \n**Ví dụ:** `/weteams-ai tóm tắt đoạn chat` hoặc `/weteams-ai viết cho tôi một email xin phép.`",
                false,
            );
            return;
        }

        // Hiện lại tin nhắn người dùng
        await this.sendMessage(
            modify,
            read,
            room,
            sender,
            `/weteams-ai ${userPrompt}`,
            true,
        );

        try {
            // Gửi tin nhắn chờ
            await this.notifyUser(
                context,
                read,
                "Trợ lý Weteams đang suy nghĩ...",
            );

            // Lấy ngữ cảnh chat
            const rawMessages = await read.getRoomReader().getMessages(room.id);

            // Lọc tin nhắn ngữ cảnh
            const chatContext = rawMessages
                .filter((msg) => msg.text)
                .reverse()
                .map((msg) => `[${msg.sender.username}]: ${msg.text}`)
                .join("\n");

            // Lấy settings từ app
            const { apiKey, llmModel } = await this.getRuntimeSettings(read);

            if (!apiKey) {
                await this.sendMessage(
                    modify,
                    read,
                    room,
                    sender,
                    "Lỗi: API Key chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
                    false,
                );
                return;
            }

            // Gọi API
            const aiResponse = await this.callLLMApi(
                chatContext,
                userPrompt,
                http,
                apiKey,
                llmModel,
            );

            // Gửi kết quả cuối cùng
            await this.sendMessage(
                modify,
                read,
                room,
                sender,
                `${aiResponse}`,
                false,
            );
        } catch (error) {
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : "Đã xảy ra lỗi không xác định";
            await this.notifyUser(context, read, `Lỗi: ${errorMessage}`);
        }
    }

    /**
     * Gọi API LLM với System Instruction
     */
    private async callLLMApi(
        chatContext: string,
        userPrompt: string,
        http: IHttp,
        apiKey: string,
        llmModel: string,
    ): Promise<string> {
        // Cấu hình URL API động dựa trên model được chọn từ app setting
        const modelId = llmModel || "gemini-flash-lite-latest";
        const apiEndpoint = `${this.apiBaseEndpoint}/${modelId}:generateContent`;

        // 1. System Instruction: Xác định tính cách và nhiệm vụ của AI
        const systemPrompt = `Bạn là WeTeams AI, một trợ lý ảo thông minh được tích hợp trực tiếp vào ứng dụng chat.
Nhiệm vụ của bạn là giúp người dùng trả lời câu hỏi, tóm tắt lịch sử chat, dịch thuật, phân tích dữ liệu hoặc lên ý tưởng.
- Bạn sẽ được cung cấp "Lịch sử đoạn chat" để làm ngữ cảnh (nếu người dùng yêu cầu tóm tắt hoặc nhắc đến các tin nhắn trước đó).
- Nếu câu hỏi của người dùng là kiến thức độc lập (VD: "Trái đất nặng bao nhiêu?"), hãy cứ trả lời thẳng mà không cần quan tâm lịch sử chat.
- Luôn sử dụng ngôn ngữ tự nhiên, thân thiện, súc tích. Dùng Markdown để làm nổi bật (in đậm, danh sách) cho dễ đọc.`;

        // 2. Gộp ngữ cảnh và yêu cầu của người dùng
        let finalPrompt = "";
        if (chatContext) {
            finalPrompt += `--- LỊCH SỬ ĐOẠN CHAT (Dùng làm ngữ cảnh nếu cần) ---\n${chatContext}\n---------------------------\n\n`;
        }
        finalPrompt += `**Lệnh của người dùng:** ${userPrompt}`;

        const headers = {
            "Content-Type": "application/json",
            "X-goog-api-key": apiKey,
        };

        const response = await http.post(apiEndpoint, {
            headers,
            data: {
                systemInstruction: {
                    parts: [{ text: systemPrompt }],
                },
                contents: [
                    {
                        parts: [{ text: finalPrompt }],
                    },
                ],
                generationConfig: {
                    temperature: 0.5, // Tăng lên 0.5 để AI linh hoạt hơn khi sáng tạo hoặc trả lời câu hỏi mở
                    maxOutputTokens: 1000,
                },
            },
        });

        if (response.statusCode !== 200) {
            throw new Error(
                `Google API Status ${response.statusCode}: ${response.content}`,
            );
        }

        const data = JSON.parse(response.content || "{}");
        const aiText =
            data.candidates?.[0]?.content?.parts?.[0]?.text ||
            "Không có phản hồi từ LLM.";

        return aiText.trim();
    }

    /**
     * Lấy settings từ app runtime
     */
    private async getRuntimeSettings(
        read: IRead,
    ): Promise<{ apiKey: string; llmModel: string }> {
        const settingsReader = read.getEnvironmentReader().getSettings();
        const [apiKey, llmModel] = await Promise.all([
            settingsReader.getValueById("apiKey"),
            settingsReader.getValueById("llmModel"),
        ]);

        return {
            apiKey: typeof apiKey === "string" ? apiKey : "",
            llmModel:
                typeof llmModel === "string"
                    ? llmModel
                    : "gemini-flash-lite-latest",
        };
    }

    /**
     * Gửi tin nhắn trả về room chat
     */
    private async sendMessage(
        modify: IModify,
        read: IRead,
        room: IRoom,
        sender: IUser,
        text: string,
        userSend: boolean,
    ): Promise<void> {
        const appUser = await read.getUserReader().getAppUser(this.appInfo.id);

        const messageBuilder = modify.getCreator().startMessage();

        messageBuilder.setRoom(room).setText(text);

        if (userSend === true) {
            messageBuilder.setSender(sender);
        } else {
            messageBuilder.setSender(appUser as IUser);
        }

        await modify.getCreator().finish(messageBuilder);
    }

    private async notifyUser(
        context: SlashCommandContext,
        read: IRead,
        message: string,
    ): Promise<void> {
        const notifier = read.getNotifier();
        const messageBuilder = notifier.getMessageBuilder();
        messageBuilder.setText(message);
        messageBuilder.setRoom(context.getRoom());
        await notifier.notifyUser(
            context.getSender(),
            messageBuilder.getMessage(),
        );
    }
}
