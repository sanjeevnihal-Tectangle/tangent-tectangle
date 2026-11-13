import {
  Award, Baby, BadgeCheck, Bell, Bot, Brain, Briefcase, Building2, Calendar, Camera, Car, ChartColumn, ChartPie, CircleCheck,
  Clock, Cloud, Coffee, Cpu, CreditCard, Crown, Droplet, Dumbbell, Flame, Gem, Gift, Globe, GraduationCap, Hammer, Handshake,
  Headset, Heart, House, Image, Infinity as InfinityIcon, Layers, LayoutDashboard, Leaf, Lightbulb, Lock, Mail, MapPin, Megaphone,
  MessageCircle, Music, Package, Palette, PawPrint, PenTool, Percent, Phone, Plane, Plug, Recycle, Rocket, Scissors, Search,
  Settings, ShieldCheck, Shirt, ShoppingBag, ShoppingCart, Smile, Sparkles, Star, Stethoscope, Store, Sun, Tag, Target, ThumbsUp,
  Timer, TrendingUp, Truck, UserCheck, Users, Utensils, Video, Wallet, WashingMachine, Workflow, Wrench, Zap,
  type LucideIcon,
} from "lucide-react"

import type { DesignIcon } from "@/lib/creative/icons"

export const DESIGN_ICON_COMPONENTS: Record<DesignIcon, LucideIcon> = {
  sparkles: Sparkles, zap: Zap, rocket: Rocket, target: Target, "trending-up": TrendingUp, "chart-column": ChartColumn,
  "chart-pie": ChartPie, bot: Bot, brain: Brain, cpu: Cpu, cloud: Cloud, "shield-check": ShieldCheck, lock: Lock, clock: Clock,
  calendar: Calendar, bell: Bell, mail: Mail, "message-circle": MessageCircle, phone: Phone, users: Users, "user-check": UserCheck,
  heart: Heart, star: Star, "thumbs-up": ThumbsUp, gift: Gift, tag: Tag, percent: Percent, "shopping-cart": ShoppingCart,
  "shopping-bag": ShoppingBag, "credit-card": CreditCard, wallet: Wallet, truck: Truck, package: Package, store: Store,
  house: House, "map-pin": MapPin, globe: Globe, search: Search, settings: Settings, wrench: Wrench, layers: Layers,
  "layout-dashboard": LayoutDashboard, megaphone: Megaphone, camera: Camera, image: Image, video: Video, palette: Palette,
  "pen-tool": PenTool, "circle-check": CircleCheck, award: Award, leaf: Leaf, coffee: Coffee, utensils: Utensils,
  stethoscope: Stethoscope, "graduation-cap": GraduationCap, shirt: Shirt, "washing-machine": WashingMachine,
  briefcase: Briefcase, "building-2": Building2, lightbulb: Lightbulb, handshake: Handshake, smile: Smile, workflow: Workflow,
  plug: Plug, infinity: InfinityIcon, "badge-check": BadgeCheck, timer: Timer, headset: Headset, sun: Sun, dumbbell: Dumbbell,
  car: Car, plane: Plane, music: Music, baby: Baby, "paw-print": PawPrint, scissors: Scissors, hammer: Hammer, gem: Gem,
  crown: Crown, flame: Flame, droplet: Droplet, recycle: Recycle,
}
