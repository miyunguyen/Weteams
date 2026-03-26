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
import { UIActionButtonContext } from "@rocket.chat/apps-engine/definition/ui";
import {
    UIKitActionButtonInteractionContext,
    IUIKitResponse,
    UIKitSurfaceType,
    IUIKitInteractionHandler,
    UIKitViewSubmitInteractionContext,
} from "@rocket.chat/apps-engine/definition/uikit";
export class MyRocketChatApp extends App implements IUIKitInteractionHandler {
    private readonly JOIN_MODAL_BLOCK = "join_team_code_block";
    private readonly JOIN_MODAL_INPUT = "join_team_code_input";

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
        });
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
        const rawCode = this.readInputValue(
            data.view && data.view.state ? data.view.state : undefined,
            this.JOIN_MODAL_BLOCK,
            this.JOIN_MODAL_INPUT,
        );

        // if (!result.ok) {
        //     this.getLogger().log(
        //         "Join by code failed for user " +
        //             user.username +
        //             ", reason=" +
        //             result.reason,
        //     );
        //     return context.getInteractionResponder().successResponse();
        // }

        // this.getLogger().log(
        //     "User " +
        //         user.username +
        //         " joined room " +
        //         result.roomId +
        //         " by code " +
        //         joinCode,
        // );
        return context.getInteractionResponder().successResponse();
    }

    private readInputValue(
        state: any,
        blockId: string,
        actionId: string,
    ): string {
        if (!state || !state[blockId] || !state[blockId][actionId]) {
            return "";
        }

        const input = state[blockId][actionId];
        if (typeof input.value === "string") {
            return input.value;
        }

        return "";
    }
}
