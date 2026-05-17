export type RocketChatSettingValue = string | boolean;

export type RocketChatSettingUpdate = {
  id: string;
  body: {
    value: RocketChatSettingValue;
    color?: string;
    editor?: string;
    execute?: boolean;
  };
};

export function buildInitialTenantRocketSettings(): RocketChatSettingUpdate[] {
  return [
    {
      id: 'Show_Setup_Wizard',
      body: {
        value: 'completed',
      },
    },
    {
      id: 'Accounts_TwoFactorAuthentication_Enabled',
      body: {
        value: false,
      },
    },
    {
      id: 'UI_Allow_room_names_with_special_chars',
      body: {
        value: true,
      },
    },
  ];
}
