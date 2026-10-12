// One icon set for the whole app: Phosphor (decision #103), drawn with react-native-svg (already
// in the native build, so icon changes ship as an EAS Update). Each icon is imported on its own
// so the bundle only carries the ones listed here. Keys keep the names the screens already used.
// Brand marks (WhatsApp, Instagram, Facebook) stay the official files in brandIcons.tsx.
import type { Icon as PhosphorIcon } from 'phosphor-react-native';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

// Each icon is required from its own file: Metro bundles only these (the package index would
// pull in all ~1,500). require() keeps TypeScript out of Phosphor's .tsx sources (they don't
// typecheck against our react-native-svg); the type comes from the package's public typings.
/* eslint-disable @typescript-eslint/no-require-imports */
const icon = (mod: Record<string, PhosphorIcon>, name: string): PhosphorIcon => mod[name]!;
const ArrowBendUpLeftIcon = icon(
  require('phosphor-react-native/src/icons/ArrowBendUpLeft'),
  'ArrowBendUpLeftIcon',
);
const ArrowClockwiseIcon = icon(
  require('phosphor-react-native/src/icons/ArrowClockwise'),
  'ArrowClockwiseIcon',
);
const ArrowCounterClockwiseIcon = icon(
  require('phosphor-react-native/src/icons/ArrowCounterClockwise'),
  'ArrowCounterClockwiseIcon',
);
const ArrowDownIcon = icon(require('phosphor-react-native/src/icons/ArrowDown'), 'ArrowDownIcon');
const ArrowLeftIcon = icon(require('phosphor-react-native/src/icons/ArrowLeft'), 'ArrowLeftIcon');
const ArrowRightIcon = icon(
  require('phosphor-react-native/src/icons/ArrowRight'),
  'ArrowRightIcon',
);
const ArrowSquareOutIcon = icon(
  require('phosphor-react-native/src/icons/ArrowSquareOut'),
  'ArrowSquareOutIcon',
);
const ArrowUpIcon = icon(require('phosphor-react-native/src/icons/ArrowUp'), 'ArrowUpIcon');
const BabyIcon = icon(require('phosphor-react-native/src/icons/Baby'), 'BabyIcon');
const BellIcon = icon(require('phosphor-react-native/src/icons/Bell'), 'BellIcon');
const BowlFoodIcon = icon(require('phosphor-react-native/src/icons/BowlFood'), 'BowlFoodIcon');
const CameraIcon = icon(require('phosphor-react-native/src/icons/Camera'), 'CameraIcon');
const CaretDownIcon = icon(require('phosphor-react-native/src/icons/CaretDown'), 'CaretDownIcon');
const CaretLeftIcon = icon(require('phosphor-react-native/src/icons/CaretLeft'), 'CaretLeftIcon');
const CaretRightIcon = icon(
  require('phosphor-react-native/src/icons/CaretRight'),
  'CaretRightIcon',
);
const CaretUpIcon = icon(require('phosphor-react-native/src/icons/CaretUp'), 'CaretUpIcon');
const ChartBarIcon = icon(require('phosphor-react-native/src/icons/ChartBar'), 'ChartBarIcon');
const ChatCircleIcon = icon(
  require('phosphor-react-native/src/icons/ChatCircle'),
  'ChatCircleIcon',
);
const ChatTextIcon = icon(require('phosphor-react-native/src/icons/ChatText'), 'ChatTextIcon');
const CheckIcon = icon(require('phosphor-react-native/src/icons/Check'), 'CheckIcon');
const CheckCircleIcon = icon(
  require('phosphor-react-native/src/icons/CheckCircle'),
  'CheckCircleIcon',
);
const CircleIcon = icon(require('phosphor-react-native/src/icons/Circle'), 'CircleIcon');
const ClockIcon = icon(require('phosphor-react-native/src/icons/Clock'), 'ClockIcon');
const CopyIcon = icon(require('phosphor-react-native/src/icons/Copy'), 'CopyIcon');
const CreditCardIcon = icon(
  require('phosphor-react-native/src/icons/CreditCard'),
  'CreditCardIcon',
);
const DeviceMobileIcon = icon(
  require('phosphor-react-native/src/icons/DeviceMobile'),
  'DeviceMobileIcon',
);
const DotsThreeIcon = icon(require('phosphor-react-native/src/icons/DotsThree'), 'DotsThreeIcon');
const DotsThreeVerticalIcon = icon(
  require('phosphor-react-native/src/icons/DotsThreeVertical'),
  'DotsThreeVerticalIcon',
);
const DropIcon = icon(require('phosphor-react-native/src/icons/Drop'), 'DropIcon');
const EyeIcon = icon(require('phosphor-react-native/src/icons/Eye'), 'EyeIcon');
const EyeSlashIcon = icon(require('phosphor-react-native/src/icons/EyeSlash'), 'EyeSlashIcon');
const FileTextIcon = icon(require('phosphor-react-native/src/icons/FileText'), 'FileTextIcon');
const FlagIcon = icon(require('phosphor-react-native/src/icons/Flag'), 'FlagIcon');
const GearIcon = icon(require('phosphor-react-native/src/icons/Gear'), 'GearIcon');
const GiftIcon = icon(require('phosphor-react-native/src/icons/Gift'), 'GiftIcon');
const HandbagIcon = icon(require('phosphor-react-native/src/icons/Handbag'), 'HandbagIcon');
const HeartIcon = icon(require('phosphor-react-native/src/icons/Heart'), 'HeartIcon');
const HouseIcon = icon(require('phosphor-react-native/src/icons/House'), 'HouseIcon');
const ImagesIcon = icon(require('phosphor-react-native/src/icons/Images'), 'ImagesIcon');
const InfoIcon = icon(require('phosphor-react-native/src/icons/Info'), 'InfoIcon');
const InstagramLogoIcon = icon(
  require('phosphor-react-native/src/icons/InstagramLogo'),
  'InstagramLogoIcon',
);
const LightningIcon = icon(require('phosphor-react-native/src/icons/Lightning'), 'LightningIcon');
const ListIcon = icon(require('phosphor-react-native/src/icons/List'), 'ListIcon');
const LockIcon = icon(require('phosphor-react-native/src/icons/Lock'), 'LockIcon');
const MagnifyingGlassIcon = icon(
  require('phosphor-react-native/src/icons/MagnifyingGlass'),
  'MagnifyingGlassIcon',
);
const MapPinIcon = icon(require('phosphor-react-native/src/icons/MapPin'), 'MapPinIcon');
const MinusIcon = icon(require('phosphor-react-native/src/icons/Minus'), 'MinusIcon');
const MoneyIcon = icon(require('phosphor-react-native/src/icons/Money'), 'MoneyIcon');
const MotorcycleIcon = icon(
  require('phosphor-react-native/src/icons/Motorcycle'),
  'MotorcycleIcon',
);
const PackageIcon = icon(require('phosphor-react-native/src/icons/Package'), 'PackageIcon');
const PauseCircleIcon = icon(
  require('phosphor-react-native/src/icons/PauseCircle'),
  'PauseCircleIcon',
);
const PencilSimpleIcon = icon(
  require('phosphor-react-native/src/icons/PencilSimple'),
  'PencilSimpleIcon',
);
const PencilSimpleLineIcon = icon(
  require('phosphor-react-native/src/icons/PencilSimpleLine'),
  'PencilSimpleLineIcon',
);
const PhoneIcon = icon(require('phosphor-react-native/src/icons/Phone'), 'PhoneIcon');
const PlusIcon = icon(require('phosphor-react-native/src/icons/Plus'), 'PlusIcon');
const PlusCircleIcon = icon(
  require('phosphor-react-native/src/icons/PlusCircle'),
  'PlusCircleIcon',
);
const QrCodeIcon = icon(require('phosphor-react-native/src/icons/QrCode'), 'QrCodeIcon');
const QuestionIcon = icon(require('phosphor-react-native/src/icons/Question'), 'QuestionIcon');
const ReceiptIcon = icon(require('phosphor-react-native/src/icons/Receipt'), 'ReceiptIcon');
const ShareNetworkIcon = icon(
  require('phosphor-react-native/src/icons/ShareNetwork'),
  'ShareNetworkIcon',
);
const ShieldCheckIcon = icon(
  require('phosphor-react-native/src/icons/ShieldCheck'),
  'ShieldCheckIcon',
);
const ShoppingBagIcon = icon(
  require('phosphor-react-native/src/icons/ShoppingBag'),
  'ShoppingBagIcon',
);
const SignOutIcon = icon(require('phosphor-react-native/src/icons/SignOut'), 'SignOutIcon');
const SquaresFourIcon = icon(
  require('phosphor-react-native/src/icons/SquaresFour'),
  'SquaresFourIcon',
);
const StarIcon = icon(require('phosphor-react-native/src/icons/Star'), 'StarIcon');
const StorefrontIcon = icon(
  require('phosphor-react-native/src/icons/Storefront'),
  'StorefrontIcon',
);
const TShirtIcon = icon(require('phosphor-react-native/src/icons/TShirt'), 'TShirtIcon');
const TextTIcon = icon(require('phosphor-react-native/src/icons/TextT'), 'TextTIcon');
const TrashIcon = icon(require('phosphor-react-native/src/icons/Trash'), 'TrashIcon');
const TruckIcon = icon(require('phosphor-react-native/src/icons/Truck'), 'TruckIcon');
const UserIcon = icon(require('phosphor-react-native/src/icons/User'), 'UserIcon');
const UsersIcon = icon(require('phosphor-react-native/src/icons/Users'), 'UsersIcon');
const UsersThreeIcon = icon(
  require('phosphor-react-native/src/icons/UsersThree'),
  'UsersThreeIcon',
);
const WarningIcon = icon(require('phosphor-react-native/src/icons/Warning'), 'WarningIcon');
const WarningCircleIcon = icon(
  require('phosphor-react-native/src/icons/WarningCircle'),
  'WarningCircleIcon',
);
const WifiSlashIcon = icon(require('phosphor-react-native/src/icons/WifiSlash'), 'WifiSlashIcon');
const WrenchIcon = icon(require('phosphor-react-native/src/icons/Wrench'), 'WrenchIcon');
const XIcon = icon(require('phosphor-react-native/src/icons/X'), 'XIcon');
const XCircleIcon = icon(require('phosphor-react-native/src/icons/XCircle'), 'XCircleIcon');
/* eslint-enable @typescript-eslint/no-require-imports */

const ICONS = {
  check: CheckIcon,
  'check-circle': CheckCircleIcon,
  plus: PlusIcon,
  'plus-circle': PlusCircleIcon,
  minus: MinusIcon,
  x: XIcon,
  'x-circle': XCircleIcon,
  'chevron-right': CaretRightIcon,
  'chevron-left': CaretLeftIcon,
  'chevron-down': CaretDownIcon,
  'chevron-up': CaretUpIcon,
  'arrow-right': ArrowRightIcon,
  'arrow-left': ArrowLeftIcon,
  'arrow-up': ArrowUpIcon,
  'arrow-down': ArrowDownIcon,
  'corner-up-left': ArrowBendUpLeftIcon,
  'external-link': ArrowSquareOutIcon,
  'refresh-cw': ArrowClockwiseIcon,
  'rotate-cw': ArrowClockwiseIcon,
  'rotate-ccw': ArrowCounterClockwiseIcon,
  camera: CameraIcon,
  images: ImagesIcon,
  home: HouseIcon,
  'home-outline': HouseIcon,
  'file-text': ReceiptIcon,
  'file-document-outline': FileTextIcon,
  'shopping-bag': ShoppingBagIcon,
  storefront: StorefrontIcon,
  'storefront-outline': StorefrontIcon,
  grid: SquaresFourIcon,
  search: MagnifyingGlassIcon,
  'message-circle': ChatCircleIcon,
  'chat-outline': ChatCircleIcon,
  'alert-circle': WarningCircleIcon,
  'alert-triangle': WarningIcon,
  info: InfoIcon,
  'help-circle': QuestionIcon,
  share: ShareNetworkIcon,
  'more-vertical': DotsThreeVerticalIcon,
  'dots-horizontal': DotsThreeIcon,
  lock: LockIcon,
  shield: ShieldCheckIcon,
  copy: CopyIcon,
  bell: BellIcon,
  'wifi-off': WifiSlashIcon,
  users: UsersIcon,
  'account-group-outline': UsersThreeIcon,
  star: StarIcon,
  heart: HeartIcon,
  flag: FlagIcon,
  phone: PhoneIcon,
  eye: EyeIcon,
  'eye-off': EyeSlashIcon,
  edit: PencilSimpleIcon,
  'edit-2': PencilSimpleIcon,
  'edit-3': PencilSimpleLineIcon,
  'trash-2': TrashIcon,
  'bar-chart-2': ChartBarIcon,
  truck: TruckIcon,
  bike: MotorcycleIcon,
  'map-pin': MapPinIcon,
  'credit-card': CreditCardIcon,
  'dollar-sign': MoneyIcon,
  clock: ClockIcon,
  tool: WrenchIcon,
  zap: LightningIcon,
  qrcode: QrCodeIcon,
  'package-variant-closed': PackageIcon,
  'tshirt-crew-outline': TShirtIcon,
  'shopping-outline': HandbagIcon,
  'lotion-outline': DropIcon,
  'bowl-mix-outline': BowlFoodIcon,
  cellphone: DeviceMobileIcon,
  'emoticon-happy-outline': BabyIcon,
  'circle-outline': CircleIcon,
  instagram: InstagramLogoIcon,
  type: TextTIcon,
  settings: GearIcon,
  menu: ListIcon,
  'message-square': ChatTextIcon,
  'star-outline': StarIcon,
  smartphone: DeviceMobileIcon,
  user: UserIcon,
  'pause-circle': PauseCircleIcon,
  'log-out': SignOutIcon,
  circle: CircleIcon,
  'gift-outline': GiftIcon,
} as const;

export type IconName = keyof typeof ICONS;

/** Regular strokes by default; `fill` for selected states (e.g. the active tab). */
export type IconWeight = 'regular' | 'bold' | 'fill';

/** Decorative: the pressable around an icon carries its accessible name. */
export function Icon({
  name,
  size = 24,
  color,
  weight = 'regular',
  style,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  weight?: IconWeight;
  style?: StyleProp<ViewStyle>;
}) {
  const Glyph = ICONS[name];
  return <Glyph size={size} color={color as string | undefined} weight={weight} style={style} />;
}
