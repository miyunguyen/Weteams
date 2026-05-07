import {
    ISetting,
    SettingType,
} from "@rocket.chat/apps-engine/definition/settings";

export const settings: Array<ISetting> = [
    {
        id: "tenantId",
        type: SettingType.STRING,
        packageValue: "",
        value: "",
        required: true,
        public: false,
        i18nLabel: "Tenant Id",
        i18nDescription: "",
    },
    {
        id: "apiUrl",
        type: SettingType.STRING,
        packageValue: "https://api.weteams.net",
        required: true,
        public: false,
        i18nLabel: "API URL",
        i18nDescription: "",
    },
    {
        id: "apiKey",
        type: SettingType.PASSWORD,
        packageValue: "",
        required: false,
        public: false,
        i18nLabel: "API KEY",
        i18nDescription: "",
    },
    {
        id: "llmModel",
        type: SettingType.SELECT,
        packageValue: "gemini-flash-lite-latest",
        values: [
            {
                key: "gemini-3.1-flash-lite-preview",
                i18nLabel: "Gemini 3.1 Flash-Lite",
            },
            {
                key: "gemini-2.5-flash-lite",
                i18nLabel: "Gemini 2.5 Flash-Lite",
            },
            {
                key: "gemini-2.0-flash-lite",
                i18nLabel: "Gemini 2.0 Flash-Lite",
            },

            {
                key: "gemini-3-flash-preview",
                i18nLabel: "Gemini 3 Flash Preview",
            },
            {
                key: "gemini-2.5-flash",
                i18nLabel: "Gemini 2.5 Flash",
            },
            {
                key: "gemini-flash-latest",
                i18nLabel: "Gemini Flash Latest",
            },
            {
                key: "gemini-3.1-pro-preview",
                i18nLabel: "Gemini 3.1 Pro",
            },
            {
                key: "gemini-3-pro-preview",
                i18nLabel: "Gemini 3 Pro Preview",
            },
            {
                key: "gemini-2.5-pro",
                i18nLabel: "Gemini 2.5 Pro (High Context)",
            },
            {
                key: "deep-research-max-preview-04-2026",
                i18nLabel: "Deep Research Max",
            },
            {
                key: "gemma-4-31b-it",
                i18nLabel: "Gemma 4 31B",
            },
            {
                key: "aqa",
                i18nLabel: "AQA Model",
            },
        ],
        required: false,
        public: false,
        i18nLabel: "LLM Model",
        i18nDescription: "",
    },
];
