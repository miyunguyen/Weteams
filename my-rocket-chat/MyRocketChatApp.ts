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
    IPostRoomUserLeave,
    IRoom,
    IRoomUserLeaveContext,
} from "@rocket.chat/apps-engine/definition/rooms";
import {
    ISetting,
    SettingType,
} from "@rocket.chat/apps-engine/definition/settings";
import { UIActionButtonContext } from "@rocket.chat/apps-engine/definition/ui";
import {
    UIKitActionButtonInteractionContext,
    IUIKitResponse,
    UIKitSurfaceType,
    IUIKitInteractionHandler,
    UIKitViewSubmitInteractionContext,
} from "@rocket.chat/apps-engine/definition/uikit";
import { IUser } from "@rocket.chat/apps-engine/definition/users";

const settings: Array<ISetting> = [
    {
        id: "tenantId",
        type: SettingType.STRING,
        packageValue: "",
        required: false,
        public: false,
        i18nLabel: "Tenant Id",
        i18nDescription: "",
    },
    {
        id: "apiUrl",
        type: SettingType.STRING,
        packageValue:
            "https://scalelike-nondevotionally-helaine.ngrok-free.dev",
        required: false,
        public: false,
        i18nLabel: "API URL",
        i18nDescription: "",
    },
];
export class MyRocketChatApp
    extends App
    implements IUIKitInteractionHandler, IPostRoomCreate, IPostRoomUserLeave
{
    private readonly JOIN_MODAL_BLOCK = "join_team_code_block";
    private readonly JOIN_MODAL_INPUT = "join_team_code_input";
    private tenantId: Promise<string>;
    private apiUrl: Promise<string>;

    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        _environmentRead: IEnvironmentRead,
    ): Promise<void> {
        configuration.ui.registerButton({
            actionId: "join-team-btn",
            labelI18n: "join-team-btn",
            context: UIActionButtonContext.USER_DROPDOWN_ACTION,
        });

        await Promise.all(
            settings.map((setting) =>
                configuration.settings.provideSetting(setting),
            ),
        );

        const settingsReader = _environmentRead.getSettings();

        this.tenantId = settingsReader
            .getValueById("tenantId")
            .then((value) => (value as string) || "");
        this.apiUrl = settingsReader
            .getValueById("apiUrl")
            .then((value) => (value as string) || "");
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

        const [tenantId, apiUrl] = await Promise.all([
            this.tenantId,
            this.apiUrl,
        ]);

        const body = {
            tenantId: tenantId,
            roomId: room.id,
            roomName: room.displayName,
        };

        try {
            const response = await http.post(`${apiUrl}/team/from-room`, {
                headers: { "Content-Type": "application/json" },
                data: body,
            });

            this.getLogger().log(response, body, room.teamId);
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
        _http: IHttp,
        _persistence: IPersistence,
        modify: IModify,
    ): Promise<IUIKitResponse> {
        const data = context.getInteractionData();

        if (data.actionId === "join-team-btn") {
            await modify.getUiController().openSurfaceView(
                {
                    type: UIKitSurfaceType.MODAL,
                    id: "join-team-modal",
                    title: {
                        text: "Join room by code",
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
                                    text: "Example: A9K2Q7XZ",
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

        const [tenantId, apiUrl] = await Promise.all([
            this.tenantId,
            this.apiUrl,
        ]);

        try {
            const res = await _http.post(`${apiUrl}/team/join`, {
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

        const [tenantId, apiUrl] = await Promise.all([
            this.tenantId,
            this.apiUrl,
        ]);

        try {
            const res = await http.post(`${apiUrl}/team/leave`, {
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
}
