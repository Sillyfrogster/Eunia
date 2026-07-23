import type { Application } from "./application";
import type { Channel, ChannelType } from "./channel";
import type { ISO8601Timestamp, Snowflake } from "./common";
import type { Emoji } from "./emoji";
import type { GuildMember, Role } from "./guild";
import type { InteractionType } from "./interaction";
import type { Sticker, StickerItem } from "./sticker";
import type { User } from "./user";

export enum MessageType {
  Default = 0,
  RecipientAdd = 1,
  RecipientRemove = 2,
  Call = 3,
  ChannelNameChange = 4,
  ChannelIconChange = 5,
  ChannelPinnedMessage = 6,
  UserJoin = 7,
  GuildBoost = 8,
  GuildBoostTier1 = 9,
  GuildBoostTier2 = 10,
  GuildBoostTier3 = 11,
  ChannelFollowAdd = 12,
  GuildDiscoveryDisqualified = 14,
  GuildDiscoveryRequalified = 15,
  GuildDiscoveryGracePeriodInitialWarning = 16,
  GuildDiscoveryGracePeriodFinalWarning = 17,
  ThreadCreated = 18,
  Reply = 19,
  ChatInputCommand = 20,
  ThreadStarterMessage = 21,
  GuildInviteReminder = 22,
  ContextMenuCommand = 23,
  AutoModerationAction = 24,
  RoleSubscriptionPurchase = 25,
  InteractionPremiumUpsell = 26,
  StageStart = 27,
  StageEnd = 28,
  StageSpeaker = 29,
  StageTopic = 31,
  GuildApplicationPremiumSubscription = 32,
  GuildIncidentAlertModeEnabled = 36,
  GuildIncidentAlertModeDisabled = 37,
  GuildIncidentReportRaid = 38,
  GuildIncidentReportFalseAlarm = 39,
  PurchaseNotification = 44,
  PollResult = 46,
}

export enum MessageReferenceType {
  Default = 0,
  Forward = 1,
}

export enum MessageActivityType {
  Join = 1,
  Spectate = 2,
  Listen = 3,
  JoinRequest = 5,
}

export enum ReactionType {
  Normal = 0,
  Burst = 1,
}

export enum AttachmentFlags {
  IsClip = 1 << 0,
  IsThumbnail = 1 << 1,
  IsRemix = 1 << 2,
  IsSpoiler = 1 << 3,
  IsAnimated = 1 << 5,
}

export enum EmbedFlags {
  IsContentInventoryEntry = 1 << 5,
}

export enum BaseThemeType {
  Unset = 0,
  Dark = 1,
  Light = 2,
  Darker = 3,
  Midnight = 4,
}

export enum PollLayoutType {
  Default = 1,
}

export enum MessageFlags {
  Crossposted = 1 << 0,
  IsCrosspost = 1 << 1,
  SuppressEmbeds = 1 << 2,
  SourceMessageDeleted = 1 << 3,
  Urgent = 1 << 4,
  HasThread = 1 << 5,
  Ephemeral = 1 << 6,
  Loading = 1 << 7,
  FailedToMentionSomeRolesInThread = 1 << 8,
  SuppressNotifications = 1 << 12,
  IsVoiceMessage = 1 << 13,
  HasSnapshot = 1 << 14,
  IsComponentsV2 = 1 << 15,
}

export enum ComponentType {
  ActionRow = 1,
  Button = 2,
  StringSelect = 3,
  TextInput = 4,
  UserSelect = 5,
  RoleSelect = 6,
  MentionableSelect = 7,
  ChannelSelect = 8,
  Section = 9,
  TextDisplay = 10,
  Thumbnail = 11,
  MediaGallery = 12,
  File = 13,
  Separator = 14,
  Container = 17,
  Label = 18,
  FileUpload = 19,
  RadioGroup = 21,
  CheckboxGroup = 22,
  Checkbox = 23,
}

export enum ButtonStyle {
  Primary = 1,
  Secondary = 2,
  Success = 3,
  Danger = 4,
  Link = 5,
  Premium = 6,
}

export enum TextInputStyle {
  Short = 1,
  Paragraph = 2,
}

export interface EmbedMedia {
  url: string;
  proxy_url?: string;
  height?: number;
  width?: number;
  content_type?: string;
  placeholder?: string;
  placeholder_version?: number;
  description?: string;
  flags?: number;
}

export interface EmbedVideo extends Omit<EmbedMedia, "url"> {
  url?: string;
}

export interface Embed {
  title?: string;
  type?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: { text: string; icon_url?: string; proxy_icon_url?: string };
  image?: EmbedMedia;
  thumbnail?: EmbedMedia;
  video?: EmbedVideo;
  provider?: { name?: string; url?: string };
  author?: { name: string; url?: string; icon_url?: string; proxy_icon_url?: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  flags?: number;
}

export interface Attachment {
  id: Snowflake;
  filename: string;
  title?: string;
  description?: string;
  content_type?: string;
  size: number;
  url: string;
  proxy_url: string;
  height?: number | null;
  width?: number | null;
  ephemeral?: boolean;
  duration_secs?: number;
  waveform?: string;
  flags?: number;
  placeholder?: string;
  placeholder_version?: number;
  clip_participants?: User[];
  clip_created_at?: ISO8601Timestamp;
  application?: Partial<Application> | null;
}

export interface AttachmentRequest {
  id: Snowflake | number;
  filename?: string;
  title?: string;
  description?: string;
  duration_secs?: number;
  waveform?: string;
  is_spoiler?: boolean;
}

export interface ChannelMention {
  id: Snowflake;
  guild_id: Snowflake;
  type: ChannelType;
  name: string;
}

export interface Reaction {
  count: number;
  count_details: {
    burst: number;
    normal: number;
  };
  me: boolean;
  me_burst: boolean;
  emoji: Pick<Emoji, "id" | "name" | "animated">;
  burst_colors: string[];
}

export type AllowedMentionType = "roles" | "users" | "everyone";

export interface AllowedMentions {
  parse?: readonly AllowedMentionType[];
  roles?: readonly Snowflake[];
  users?: readonly Snowflake[];
  replied_user?: boolean;
}

export interface MessageReference {
  type?: MessageReferenceType;
  message_id?: Snowflake;
  channel_id?: Snowflake;
  guild_id?: Snowflake;
  fail_if_not_exists?: boolean;
}

export interface MessageActivity {
  type: MessageActivityType;
  party_id?: string;
}

export interface RoleSubscriptionData {
  role_subscription_listing_id: Snowflake;
  tier_name: string;
  total_months_subscribed: number;
  is_renewal: boolean;
}

export interface SharedClientTheme {
  colors: string[];
  gradient_angle: number;
  base_mix: number;
  base_theme?: BaseThemeType | null;
}

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
  emoji?: ComponentEmoji;
  default?: boolean;
}

export type ComponentEmoji =
  | { id: Snowflake; name?: string; animated?: boolean }
  | { id?: null; name: string; animated?: boolean };

export interface ComponentBase<T extends ComponentType> {
  type: T;
  id?: number;
}

export interface ButtonComponentBase extends ComponentBase<ComponentType.Button> {
  label?: string;
  emoji?: ComponentEmoji;
  disabled?: boolean;
}

export type ButtonComponent =
  | (ButtonComponentBase & {
      style:
        | ButtonStyle.Primary
        | ButtonStyle.Secondary
        | ButtonStyle.Success
        | ButtonStyle.Danger;
      custom_id: string;
      sku_id?: never;
      url?: never;
    })
  | (ButtonComponentBase & {
      style: ButtonStyle.Link;
      url: string;
      custom_id?: never;
      sku_id?: never;
    })
  | (Omit<ButtonComponentBase, "emoji" | "label"> & {
      style: ButtonStyle.Premium;
      sku_id: Snowflake;
      custom_id?: never;
      emoji?: never;
      label?: never;
      url?: never;
    });

export interface StringSelectComponent extends ComponentBase<ComponentType.StringSelect> {
  custom_id: string;
  options: SelectOption[];
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  disabled?: boolean;
  required?: boolean;
}

export interface AutoSelectComponentBase<
  T extends
    | ComponentType.UserSelect
    | ComponentType.RoleSelect
    | ComponentType.MentionableSelect
    | ComponentType.ChannelSelect,
> extends ComponentBase<T> {
  custom_id: string;
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  disabled?: boolean;
  required?: boolean;
}

export type UserSelectComponent = AutoSelectComponentBase<ComponentType.UserSelect> & {
  default_values?: Array<{ id: Snowflake; type: "user" }>;
  channel_types?: never;
};

export type RoleSelectComponent = AutoSelectComponentBase<ComponentType.RoleSelect> & {
  default_values?: Array<{ id: Snowflake; type: "role" }>;
  channel_types?: never;
};

export type MentionableSelectComponent =
  AutoSelectComponentBase<ComponentType.MentionableSelect> & {
    default_values?: Array<{ id: Snowflake; type: "user" | "role" }>;
    channel_types?: never;
  };

export type ChannelSelectComponent =
  AutoSelectComponentBase<ComponentType.ChannelSelect> & {
    default_values?: Array<{ id: Snowflake; type: "channel" }>;
    channel_types?: ChannelType[];
  };

export type AutoSelectComponent =
  | UserSelectComponent
  | RoleSelectComponent
  | MentionableSelectComponent
  | ChannelSelectComponent;

export type MessageStringSelectComponent = Omit<
  StringSelectComponent,
  "required"
> & {
  required?: never;
};

export type ModalStringSelectComponent = Omit<
  StringSelectComponent,
  "disabled"
> & {
  disabled?: never;
};

type MessageAutoSelectOf<T> = T extends AutoSelectComponent
  ? Omit<T, "required"> & { required?: never }
  : never;

type ModalAutoSelectOf<T> = T extends AutoSelectComponent
  ? Omit<T, "disabled"> & { disabled?: never }
  : never;

export type MessageAutoSelectComponent = MessageAutoSelectOf<AutoSelectComponent>;

export type ModalAutoSelectComponent = ModalAutoSelectOf<AutoSelectComponent>;

export interface TextInputComponent extends ComponentBase<ComponentType.TextInput> {
  custom_id: string;
  style: TextInputStyle;
  label?: string;
  min_length?: number;
  max_length?: number;
  required?: boolean;
  value?: string;
  placeholder?: string;
}

export type MessageActionRowComponent = ComponentBase<ComponentType.ActionRow> &
  (
    | { components: ButtonComponent[] }
    | {
        components: [
          MessageStringSelectComponent | MessageAutoSelectComponent,
        ];
      }
  );

export type ModalActionRowComponent = ComponentBase<ComponentType.ActionRow> & {
  components: [TextInputComponent];
};

export type ActionRowComponent =
  | MessageActionRowComponent
  | ModalActionRowComponent;

export interface TextDisplayComponent extends ComponentBase<ComponentType.TextDisplay> {
  content: string;
}

export interface UnfurledMediaItem {
  url: string;
  proxy_url?: string;
  height?: number | null;
  width?: number | null;
  content_type?: string;
  attachment_id?: Snowflake;
}

export interface ThumbnailComponent extends ComponentBase<ComponentType.Thumbnail> {
  media: UnfurledMediaItem;
  description?: string | null;
  spoiler?: boolean;
}

export interface SectionComponent extends ComponentBase<ComponentType.Section> {
  components: TextDisplayComponent[];
  accessory: ThumbnailComponent | ButtonComponent;
}

export interface MediaGalleryComponent extends ComponentBase<ComponentType.MediaGallery> {
  items: Array<{
    media: UnfurledMediaItem;
    description?: string | null;
    spoiler?: boolean;
  }>;
}

export interface FileComponent extends ComponentBase<ComponentType.File> {
  file: UnfurledMediaItem;
  spoiler?: boolean;
  name?: string;
  size?: number;
}

export interface SeparatorComponent extends ComponentBase<ComponentType.Separator> {
  divider?: boolean;
  spacing?: 1 | 2;
}

export interface ContainerComponent extends ComponentBase<ComponentType.Container> {
  components: Array<
    | MessageActionRowComponent
    | TextDisplayComponent
    | SectionComponent
    | MediaGalleryComponent
    | FileComponent
    | SeparatorComponent
  >;
  accent_color?: number | null;
  spoiler?: boolean;
}

export interface LabelComponent extends ComponentBase<ComponentType.Label> {
  label: string;
  description?: string;
  component:
    | ModalStringSelectComponent
    | ModalAutoSelectComponent
    | TextInputComponent
    | FileUploadComponent
    | RadioGroupComponent
    | CheckboxGroupComponent
    | CheckboxComponent;
}

export interface FileUploadComponent extends ComponentBase<ComponentType.FileUpload> {
  custom_id: string;
  min_values?: number;
  max_values?: number;
  required?: boolean;
}

export interface RadioGroupComponent extends ComponentBase<ComponentType.RadioGroup> {
  custom_id: string;
  options: RadioGroupOption[];
  required?: boolean;
}

export interface RadioGroupOption {
  value: string;
  label: string;
  description?: string;
  default?: boolean;
}

export interface CheckboxGroupComponent extends ComponentBase<ComponentType.CheckboxGroup> {
  custom_id: string;
  options: CheckboxGroupOption[];
  min_values?: number;
  max_values?: number;
  required?: boolean;
}

export interface CheckboxGroupOption {
  value: string;
  label: string;
  description?: string;
  default?: boolean;
}

export interface CheckboxComponent extends ComponentBase<ComponentType.Checkbox> {
  custom_id: string;
  default?: boolean;
}

export type MessageComponent =
  | MessageActionRowComponent
  | SectionComponent
  | TextDisplayComponent
  | MediaGalleryComponent
  | FileComponent
  | SeparatorComponent
  | ContainerComponent;

export type ModalComponent =
  | ModalActionRowComponent
  | LabelComponent
  | TextDisplayComponent;

export interface TextInputInteractionResponse {
  type: ComponentType.TextInput;
  id: number;
  custom_id: string;
  value: string;
}

export interface StringSelectInteractionResponse {
  type: ComponentType.StringSelect;
  id: number;
  custom_id: string;
  values: string[];
}

export interface AutoSelectInteractionResponse {
  type:
    | ComponentType.UserSelect
    | ComponentType.RoleSelect
    | ComponentType.MentionableSelect
    | ComponentType.ChannelSelect;
  id: number;
  custom_id: string;
  values: Snowflake[];
  resolved: ResolvedData;
}

export interface FileUploadInteractionResponse {
  type: ComponentType.FileUpload;
  id: number;
  custom_id: string;
  values: Snowflake[];
}

export interface RadioGroupInteractionResponse {
  type: ComponentType.RadioGroup;
  id: number;
  custom_id: string;
  value: string | null;
}

export interface CheckboxGroupInteractionResponse {
  type: ComponentType.CheckboxGroup;
  id: number;
  custom_id: string;
  values: string[];
}

export interface CheckboxInteractionResponse {
  type: ComponentType.Checkbox;
  id: number;
  custom_id: string;
  value: boolean;
}

export type LabelInteractionResponseChild =
  | TextInputInteractionResponse
  | StringSelectInteractionResponse
  | AutoSelectInteractionResponse
  | FileUploadInteractionResponse
  | RadioGroupInteractionResponse
  | CheckboxGroupInteractionResponse
  | CheckboxInteractionResponse;

export interface LabelInteractionResponse {
  type: ComponentType.Label;
  id: number;
  component: LabelInteractionResponseChild;
}

export interface TextDisplayInteractionResponse {
  type: ComponentType.TextDisplay;
  id: number;
}

export interface ActionRowInteractionResponse {
  type: ComponentType.ActionRow;
  id: number;
  components: [TextInputInteractionResponse];
}

export type ModalSubmitComponent =
  | ActionRowInteractionResponse
  | LabelInteractionResponse
  | TextDisplayInteractionResponse;

export interface Poll {
  question: { text: string };
  answers: Array<{
    answer_id: number;
    poll_media: { text?: string; emoji?: ComponentEmoji };
  }>;
  expiry: ISO8601Timestamp | null;
  allow_multiselect: boolean;
  layout_type: PollLayoutType;
  results?: {
    is_finalized: boolean;
    answer_counts: Array<{ id: number; count: number; me_voted: boolean }>;
  };
}

export interface PollCreate {
  question: { text: string };
  answers: Array<{
    poll_media: { text?: string; emoji?: ComponentEmoji };
  }>;
  duration?: number;
  allow_multiselect?: boolean;
  layout_type?: PollLayoutType.Default;
}

export interface MessageInteractionMetadataBase {
  id: Snowflake;
  type: InteractionType;
  user: User;
  authorizing_integration_owners: Record<string, Snowflake>;
  original_response_message_id?: Snowflake;
}

export interface ApplicationCommandMessageInteractionMetadata
  extends MessageInteractionMetadataBase {
  type: InteractionType.ApplicationCommand;
  target_user?: User;
  target_message_id?: Snowflake;
}

export interface MessageComponentMessageInteractionMetadata
  extends MessageInteractionMetadataBase {
  type: InteractionType.MessageComponent;
  interacted_message_id: Snowflake;
}

export interface ModalSubmitMessageInteractionMetadata
  extends MessageInteractionMetadataBase {
  type: InteractionType.ModalSubmit;
  triggering_interaction_metadata:
    | ApplicationCommandMessageInteractionMetadata
    | MessageComponentMessageInteractionMetadata;
}

export type MessageInteractionMetadata =
  | ApplicationCommandMessageInteractionMetadata
  | MessageComponentMessageInteractionMetadata
  | ModalSubmitMessageInteractionMetadata;

export interface MessageInteraction {
  id: Snowflake;
  type: InteractionType;
  name: string;
  user: User;
  member?: Partial<Omit<GuildMember, "user">>;
}

export interface MessageCall {
  participants: Snowflake[];
  ended_timestamp?: ISO8601Timestamp | null;
}

export interface MessageSnapshot {
  message: Partial<
    Pick<
      Message,
      | "type"
      | "content"
      | "embeds"
      | "attachments"
      | "timestamp"
      | "edited_timestamp"
      | "flags"
      | "mentions"
      | "mention_roles"
      | "stickers"
      | "sticker_items"
      | "components"
    >
  >;
}

export interface Message {
  id: Snowflake;
  channel_id: Snowflake;
  guild_id?: Snowflake;
  author: User;
  member?: GuildMember;
  content: string;
  timestamp: ISO8601Timestamp;
  edited_timestamp: ISO8601Timestamp | null;
  tts: boolean;
  mention_everyone: boolean;
  mentions: Array<User & { member?: Omit<GuildMember, "user"> }>;
  mention_roles: Snowflake[];
  mention_channels?: ChannelMention[];
  attachments: Attachment[];
  embeds: Embed[];
  reactions?: Reaction[];
  nonce?: string | number;
  pinned: boolean;
  webhook_id?: Snowflake;
  type: MessageType;
  activity?: MessageActivity;
  application?: Partial<Application>;
  application_id?: Snowflake;
  message_reference?: MessageReference;
  flags?: number;
  message_snapshots?: MessageSnapshot[];
  referenced_message?: Message | null;
  interaction_metadata?: MessageInteractionMetadata;
  interaction?: MessageInteraction;
  thread?: Channel;
  components?: MessageComponent[];
  sticker_items?: StickerItem[];
  stickers?: Sticker[];
  position?: number;
  role_subscription_data?: RoleSubscriptionData;
  resolved?: ResolvedData;
  poll?: Poll;
  call?: MessageCall;
  shared_client_theme?: SharedClientTheme;
  channel_type?: ChannelType;
}

export interface MessagePin {
  pinned_at: ISO8601Timestamp;
  message: Message;
}

export interface MessagePinResponse {
  items: MessagePin[];
  has_more: boolean;
}

export interface ResolvedData {
  users?: Record<Snowflake, User>;
  members?: Record<Snowflake, Omit<GuildMember, "user" | "deaf" | "mute">>;
  roles?: Record<Snowflake, Role>;
  channels?: Record<Snowflake, ResolvedChannel>;
  messages?: Record<Snowflake, Partial<Message>>;
  attachments?: Record<Snowflake, Attachment>;
}

export type ResolvedChannel = Pick<Channel, "id" | "type"> &
  Partial<
    Pick<
      Channel,
      | "name"
      | "permissions"
      | "app_permissions"
      | "last_message_id"
      | "last_pin_timestamp"
      | "nsfw"
      | "parent_id"
      | "guild_id"
      | "flags"
      | "rate_limit_per_user"
      | "topic"
      | "position"
      | "thread_metadata"
    >
  >;

export interface FileUpload {
  data: Blob | ArrayBuffer | ArrayBufferView;
  name: string;
  description?: string;
}

export interface MessageCreate {
  content?: string;
  nonce?: string | number;
  tts?: boolean;
  embeds?: Embed[];
  allowed_mentions?: AllowedMentions;
  message_reference?: MessageReference;
  components?: MessageComponent[];
  sticker_ids?: Snowflake[];
  files?: FileUpload[];
  attachments?: AttachmentRequest[];
  flags?: number;
  enforce_nonce?: boolean;
  poll?: PollCreate;
  shared_client_theme?: SharedClientTheme;
}

export interface MessageEdit {
  content?: string | null;
  embeds?: Embed[] | null;
  flags?: number;
  allowed_mentions?: AllowedMentions | null;
  components?: MessageComponent[] | null;
  files?: FileUpload[];
  attachments?: AttachmentRequest[];
}
