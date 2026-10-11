// One icon set for the whole app: Phosphor (decision #103), drawn with react-native-svg (already
// in the native build, so icon changes ship as an EAS Update). Each icon is imported on its own
// so the bundle only carries the ones listed here. Keys keep the names the screens already used.
// Brand marks (WhatsApp, Instagram, Facebook) stay the official files in brandIcons.tsx.
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import { ArrowBendUpLeftIcon } from 'phosphor-react-native/src/icons/ArrowBendUpLeft';
import { ArrowClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowClockwise';
import { ArrowCounterClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowCounterClockwise';
import { ArrowDownIcon } from 'phosphor-react-native/src/icons/ArrowDown';
import { ArrowLeftIcon } from 'phosphor-react-native/src/icons/ArrowLeft';
import { ArrowRightIcon } from 'phosphor-react-native/src/icons/ArrowRight';
import { ArrowSquareOutIcon } from 'phosphor-react-native/src/icons/ArrowSquareOut';
import { ArrowUpIcon } from 'phosphor-react-native/src/icons/ArrowUp';
import { BabyIcon } from 'phosphor-react-native/src/icons/Baby';
import { BellIcon } from 'phosphor-react-native/src/icons/Bell';
import { BowlFoodIcon } from 'phosphor-react-native/src/icons/BowlFood';
import { CameraIcon } from 'phosphor-react-native/src/icons/Camera';
import { CaretDownIcon } from 'phosphor-react-native/src/icons/CaretDown';
import { CaretLeftIcon } from 'phosphor-react-native/src/icons/CaretLeft';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { CaretUpIcon } from 'phosphor-react-native/src/icons/CaretUp';
import { ChartBarIcon } from 'phosphor-react-native/src/icons/ChartBar';
import { ChatCircleIcon } from 'phosphor-react-native/src/icons/ChatCircle';
import { ChatTextIcon } from 'phosphor-react-native/src/icons/ChatText';
import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { CheckCircleIcon } from 'phosphor-react-native/src/icons/CheckCircle';
import { CircleIcon } from 'phosphor-react-native/src/icons/Circle';
import { ClockIcon } from 'phosphor-react-native/src/icons/Clock';
import { CopyIcon } from 'phosphor-react-native/src/icons/Copy';
import { CreditCardIcon } from 'phosphor-react-native/src/icons/CreditCard';
import { DeviceMobileIcon } from 'phosphor-react-native/src/icons/DeviceMobile';
import { DotsThreeIcon } from 'phosphor-react-native/src/icons/DotsThree';
import { DotsThreeVerticalIcon } from 'phosphor-react-native/src/icons/DotsThreeVertical';
import { DropIcon } from 'phosphor-react-native/src/icons/Drop';
import { EyeIcon } from 'phosphor-react-native/src/icons/Eye';
import { EyeSlashIcon } from 'phosphor-react-native/src/icons/EyeSlash';
import { FileTextIcon } from 'phosphor-react-native/src/icons/FileText';
import { FlagIcon } from 'phosphor-react-native/src/icons/Flag';
import { GearIcon } from 'phosphor-react-native/src/icons/Gear';
import { GiftIcon } from 'phosphor-react-native/src/icons/Gift';
import { HandbagIcon } from 'phosphor-react-native/src/icons/Handbag';
import { HeartIcon } from 'phosphor-react-native/src/icons/Heart';
import { HouseIcon } from 'phosphor-react-native/src/icons/House';
import { ImagesIcon } from 'phosphor-react-native/src/icons/Images';
import { InfoIcon } from 'phosphor-react-native/src/icons/Info';
import { InstagramLogoIcon } from 'phosphor-react-native/src/icons/InstagramLogo';
import { LightningIcon } from 'phosphor-react-native/src/icons/Lightning';
import { ListIcon } from 'phosphor-react-native/src/icons/List';
import { LockIcon } from 'phosphor-react-native/src/icons/Lock';
import { MagnifyingGlassIcon } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { MapPinIcon } from 'phosphor-react-native/src/icons/MapPin';
import { MinusIcon } from 'phosphor-react-native/src/icons/Minus';
import { MoneyIcon } from 'phosphor-react-native/src/icons/Money';
import { MotorcycleIcon } from 'phosphor-react-native/src/icons/Motorcycle';
import { MusicNotesIcon } from 'phosphor-react-native/src/icons/MusicNotes';
import { PackageIcon } from 'phosphor-react-native/src/icons/Package';
import { PauseCircleIcon } from 'phosphor-react-native/src/icons/PauseCircle';
import { PencilSimpleIcon } from 'phosphor-react-native/src/icons/PencilSimple';
import { PencilSimpleLineIcon } from 'phosphor-react-native/src/icons/PencilSimpleLine';
import { PhoneIcon } from 'phosphor-react-native/src/icons/Phone';
import { PlusIcon } from 'phosphor-react-native/src/icons/Plus';
import { PlusCircleIcon } from 'phosphor-react-native/src/icons/PlusCircle';
import { QrCodeIcon } from 'phosphor-react-native/src/icons/QrCode';
import { QuestionIcon } from 'phosphor-react-native/src/icons/Question';
import { ReceiptIcon } from 'phosphor-react-native/src/icons/Receipt';
import { ShareNetworkIcon } from 'phosphor-react-native/src/icons/ShareNetwork';
import { ShieldCheckIcon } from 'phosphor-react-native/src/icons/ShieldCheck';
import { ShoppingBagIcon } from 'phosphor-react-native/src/icons/ShoppingBag';
import { SignOutIcon } from 'phosphor-react-native/src/icons/SignOut';
import { SquaresFourIcon } from 'phosphor-react-native/src/icons/SquaresFour';
import { StarIcon } from 'phosphor-react-native/src/icons/Star';
import { StorefrontIcon } from 'phosphor-react-native/src/icons/Storefront';
import { TShirtIcon } from 'phosphor-react-native/src/icons/TShirt';
import { TextTIcon } from 'phosphor-react-native/src/icons/TextT';
import { TrashIcon } from 'phosphor-react-native/src/icons/Trash';
import { TruckIcon } from 'phosphor-react-native/src/icons/Truck';
import { UserIcon } from 'phosphor-react-native/src/icons/User';
import { UsersIcon } from 'phosphor-react-native/src/icons/Users';
import { UsersThreeIcon } from 'phosphor-react-native/src/icons/UsersThree';
import { WarningIcon } from 'phosphor-react-native/src/icons/Warning';
import { WarningCircleIcon } from 'phosphor-react-native/src/icons/WarningCircle';
import { WifiSlashIcon } from 'phosphor-react-native/src/icons/WifiSlash';
import { WrenchIcon } from 'phosphor-react-native/src/icons/Wrench';
import { XIcon } from 'phosphor-react-native/src/icons/X';
import { XCircleIcon } from 'phosphor-react-native/src/icons/XCircle';

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
  music: MusicNotesIcon,
  'music-note': MusicNotesIcon,
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
