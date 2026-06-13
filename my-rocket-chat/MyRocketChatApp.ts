import {
    IAppAccessors,
    IConfigurationExtend,
    IEnvironmentRead,
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { App } from "@rocket.chat/apps-engine/definition/App";
import { IAppInfo } from "@rocket.chat/apps-engine/definition/metadata";
import {
    IPostRoomCreate,
    IPostRoomDeleted,
    IPostRoomUserLeave,
    IRoom,
    IRoomUserLeaveContext,
} from "@rocket.chat/apps-engine/definition/rooms";
import { UIActionButtonContext } from "@rocket.chat/apps-engine/definition/ui";
import {
    UIKitActionButtonInteractionContext,
    IUIKitResponse,
    UIKitSurfaceType,
    IUIKitInteractionHandler,
    UIKitViewSubmitInteractionContext,
} from "@rocket.chat/apps-engine/definition/uikit";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { settings } from "./config/Settings";
import { AICommand } from "./commands/AICommand";

export class MyRocketChatApp
    extends App
    implements
        IUIKitInteractionHandler,
        IPostRoomCreate,
        IPostRoomUserLeave,
        IPostRoomDeleted
{
    private readonly JOIN_MODAL_BLOCK = "join_team_code_block";
    private readonly JOIN_MODAL_INPUT = "join_team_code_input";
    private readonly apiBaseEndpoint =
        "https://generativelanguage.googleapis.com/v1beta/models";

    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        _environmentRead: IEnvironmentRead,
    ): Promise<void> {
        configuration.ui.registerButton({
            actionId: "join-team-btn",
            labelI18n: "Join team",
            context: UIActionButtonContext.USER_DROPDOWN_ACTION,
            category: "ai",
        });

        configuration.ui.registerButton({
            actionId: "summarize-btn",
            labelI18n: "AI Summarize",
            context: UIActionButtonContext.MESSAGE_BOX_ACTION,
        });

        await Promise.all(
            settings.map((setting) =>
                configuration.settings.provideSetting(setting),
            ),
        );

        configuration.slashCommands.provideSlashCommand(
            new AICommand(this.getInfo()),
        );
    }

    public async executePostRoomCreate(
        room: IRoom,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        this.getLogger().log(room);

        await this.addAdminAsMember(room, read, modify);

        const { tenantId, apiUrl } = await this.getRuntimeSettings();

        const body = {
            tenantId: tenantId,
            roomId: room.id,
            roomName: room.displayName,
        };

        try {
            const response = await http.post(`${apiUrl}/v1/teams/room-syncs`, {
                headers: { "Content-Type": "application/json" },
                data: body,
            });

            const responseBody = response?.data;
            const responseData = responseBody?.data;
            const joinCode =
                responseBody?.success &&
                responseData &&
                !responseData.skipped &&
                typeof responseData.joinCode === "string"
                    ? responseData.joinCode
                    : "";

            this.getLogger().log(response, body, joinCode);
        } catch (error) {
            this.getLogger().log("failed: ", error);
        }
    }

    public async executePostRoomDeleted(
        room: IRoom,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<void> {
        const { tenantId, apiUrl } = await this.getRuntimeSettings();

        const body = {
            tenantId: tenantId,
            roomId: room.id,
        };

        try {
            const response = await http.post(`${apiUrl}/v1/teams/room-syncs`, {
                headers: { "Content-Type": "application/json" },
                data: body,
            });

            this.getLogger().log(response, body);
        } catch (error) {
            this.getLogger().log("failed: ", error);
        }
    }

    private async addAdminAsMember(
        room: IRoom,
        read: IRead,
        modify: IModify,
    ): Promise<void> {
        try {
            const updater = (await read
                .getUserReader()
                .getAppUser(this.getID())) as IUser;

            const roomUpdater = await modify
                .getUpdater()
                .room(room.id, updater);

            roomUpdater.addMemberToBeAddedByUsername("admin");

            await modify.getUpdater().finish(roomUpdater);
        } catch (error) {
            this.getLogger().warn(
                `Unable to add admin to room ${room.id}: ${String(error)}`,
            );
        }
    }

    public async executeActionButtonHandler(
        context: UIKitActionButtonInteractionContext,
        read: IRead,
        http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const data = context.getInteractionData();

        if (data.actionId === "summarize-btn") {
            const userPrompt =
                "Hãy tóm tắt cuộc trò chuyện hiện tại theo các ý chính, quyết định, việc cần làm và các điểm đáng chú ý.";

            try {
                const { apiKey, llmModel } = await this.getAiRuntimeSettings();

                if (!apiKey) {
                    await this.openAiResultModal(
                        modify,
                        data.triggerId,
                        data.user,
                        "Lỗi: API Key chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
                    );
                    return context.getInteractionResponder().successResponse();
                }

                const chatContext = await this.buildChatContext(
                    read,
                    data.room.id,
                );
                const aiResponse = await this.callGeminiApi(
                    chatContext,
                    userPrompt,
                    http,
                    apiKey,
                    llmModel,
                );

                await this.openAiResultModal(
                    modify,
                    data.triggerId,
                    data.user,
                    aiResponse,
                );

                return context.getInteractionResponder().successResponse();
            } catch (error) {
                const errorMessage =
                    error instanceof Error
                        ? error.message
                        : "Đã xảy ra lỗi không xác định";

                await this.openAiResultModal(
                    modify,
                    data.triggerId,
                    data.user,
                    `Lỗi khi tóm tắt bằng Gemini: ${errorMessage}`,
                );

                return context.getInteractionResponder().successResponse();
            }
        }

        if (data.actionId === "join-team-btn") {
            await modify.getUiController().openSurfaceView(
                {
                    type: UIKitSurfaceType.MODAL,
                    id: "join-team-modal",
                    title: {
                        text: "Join team by code",
                        type: "plain_text",
                    },
                    submit: {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Submit",
                        },
                        appId: this.getID(),
                        blockId: "join_submit_block",
                        actionId: "join_submit_action",
                    },
                    close: {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Cancel",
                        },
                        appId: this.getID(),
                        blockId: "join_close_block",
                        actionId: "join_close_action",
                    },
                    blocks: [
                        {
                            type: "input",
                            blockId: this.JOIN_MODAL_BLOCK,
                            label: {
                                type: "plain_text",
                                text: "Join code",
                            },
                            element: {
                                appId: this.getID(),
                                blockId: this.JOIN_MODAL_BLOCK,
                                actionId: this.JOIN_MODAL_INPUT,
                                type: "plain_text_input",
                                placeholder: {
                                    type: "plain_text",
                                    text: "Example: A9K2Q7",
                                },
                            },
                        },
                    ],
                },
                { triggerId: data.triggerId },
                data.user,
            );

            return context.getInteractionResponder().successResponse();
        }

        return context.getInteractionResponder().successResponse();
    }

    public async executeViewSubmitHandler(
        context: UIKitViewSubmitInteractionContext,
        read: IRead,
        _http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const data = context.getInteractionData();
        const user = data.user;
        const joinCode = await this.readInputValue(
            data.view && data.view.state ? data.view.state : undefined,
            this.JOIN_MODAL_BLOCK,
            this.JOIN_MODAL_INPUT,
        );

        const { tenantId, apiUrl } = await this.getRuntimeSettings();

        try {
            const res = await _http.post(`${apiUrl}/v1/teams/memberships`, {
                headers: {
                    "Content-Type": "application/json",
                },
                data: {
                    tenantId,
                    joinCode,
                    rocketUserId: user.id,
                    rocketUsername: user.username,
                },
            });

            this.getLogger().log(res);
            const body = res.data;

            if (!body.success) {
                return context.getInteractionResponder().errorResponse();
            }

            return context.getInteractionResponder().successResponse();
        } catch (e) {
            return context.getInteractionResponder().errorResponse();
        }
    }

    public async executePostRoomUserLeave(
        context: IRoomUserLeaveContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify?: IModify,
    ): Promise<void> {
        const room = context.room;
        const user = context.leavingUser;

        const roomId = room.id;
        const rocketUserId = user.id;

        const { tenantId, apiUrl } = await this.getRuntimeSettings();

        try {
            const res = await http.del(`${apiUrl}/v1/teams/memberships`, {
                headers: {
                    "Content-Type": "application/json",
                },
                data: {
                    tenantId,
                    roomId,
                    rocketUserId,
                },
            });

            this.getLogger().log(res);
        } catch (e) {
            this.getLogger().error("Leave sync failed", e);
        }
    }

    private async readInputValue(
        state: any,
        blockId: string,
        actionId: string,
    ): Promise<string> {
        if (!state || !state[blockId]) {
            return "";
        }

        const blockState = state[blockId];
        const actionState = blockState[actionId];

        if (typeof actionState === "string") {
            return actionState;
        }

        if (actionState && typeof actionState.value === "string") {
            return actionState.value;
        }

        return "";
    }

    private async buildChatContext(
        read: IRead,
        roomId: string,
    ): Promise<string> {
        const rawMessages = await read.getRoomReader().getMessages(roomId);

        const lines = rawMessages
            .reverse()
            .map((msg) => {
                const username =
                    msg.sender && msg.sender.username
                        ? msg.sender.username
                        : "unknown";
                const text = String(msg.text).replace(/\s+/g, " ").trim();
                const content = `[${username}]: ${text}`;
                return content;
            })
            .join("\n");

        return lines;
    }

    private async callGeminiApi(
        chatContext: string,
        userPrompt: string,
        http: IHttp,
        apiKey: string,
        llmModel: string,
    ): Promise<string> {
        const modelId = llmModel || "gemini-flash-lite-latest";
        const apiEndpoint = `${this.apiBaseEndpoint}/${modelId}:generateContent`;
        const systemPrompt = `Bạn là WeTeams AI, một trợ lý ảo: tóm tắt ngắn gọn, liệt kê quyết định, việc cần làm và điểm đáng chú ý. Ưu tiên súc tích và dễ đọc. Sử dụng Markdown.`;

        // Use full chat context as requested (no truncation) and omit userPrompt
        let finalPrompt = "";
        if (chatContext) {
            finalPrompt += `--- NGỮ CẢNH ---\n${chatContext}\n---------------------------\n\n`;
        }

        finalPrompt += `**Lệnh của người dùng:** ${userPrompt}`;

        const response = await http.post(apiEndpoint, {
            headers: {
                "Content-Type": "application/json",
                "X-goog-api-key": apiKey,
            },
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
                    temperature: 0.3,
                    maxOutputTokens: 600,
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

    private async openAiResultModal(
        modify: IModify,
        triggerId: string,
        user: IUser,
        aiResponse: string,
    ): Promise<void> {
        const modalText = this.formatModalText(aiResponse);

        await modify.getUiController().openSurfaceView(
            {
                type: UIKitSurfaceType.MODAL,
                id: "ai-summarize-modal",
                title: {
                    text: "AI Summarize",
                    type: "plain_text",
                },
                close: {
                    type: "button",
                    text: {
                        type: "plain_text",
                        text: "Close",
                    },
                    appId: this.getID(),
                    blockId: "ai_summarize_close_block",
                    actionId: "ai_summarize_close_action",
                },
                blocks: [
                    {
                        type: "section",
                        blockId: "ai_summarize_result_block",
                        text: {
                            type: "mrkdwn",
                            text: modalText,
                        },
                    },
                ],
            },
            { triggerId },
            user,
        );
    }

    private formatModalText(text: string): string {
        const trimmedText = text.trim();

        if (trimmedText.length <= 2800) {
            return trimmedText || "Không có nội dung để hiển thị.";
        }

        return `${trimmedText.slice(0, 2800)}\n\n...`;
    }

    private async getRuntimeSettings(): Promise<{
        tenantId: string;
        apiUrl: string;
    }> {
        const settingsReader =
            this.getAccessors().environmentReader.getSettings();
        const [tenantId, apiUrl] = await Promise.all([
            settingsReader.getValueById("tenantId"),
            settingsReader.getValueById("apiUrl"),
        ]);

        return {
            tenantId: typeof tenantId === "string" ? tenantId : "",
            apiUrl: typeof apiUrl === "string" ? apiUrl : "",
        };
    }

    private async getAiRuntimeSettings(): Promise<{
        apiKey: string;
        llmModel: string;
    }> {
        const settingsReader =
            this.getAccessors().environmentReader.getSettings();
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
}
