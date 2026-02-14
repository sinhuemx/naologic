import { WorkOrder } from '../domain/schedule.models';

export type ZoomLevel = 'hour' | 'day' | 'week' | 'month';
export type PanelMode = 'create' | 'edit';

export interface TimelineColumn {
  key: string;
  label: string;
  start: Date;
  end: Date;
  widthPx: number;
}

export interface TimelineVm {
  columns: TimelineColumn[];
  start: Date;
  end: Date;
  widthPx: number;
  dayWidth: number;
}

export interface ZoomConfig {
  dayWidth: number;
  beforeDays: number;
  afterDays: number;
}

export interface TimelineZoomSelectionEvent {
  option: ZoomLevel;
  event: MouseEvent;
}

export interface TimelineGridClickEvent {
  event: MouseEvent;
  workCenterId: string;
}

export interface TimelineToggleMenuEvent {
  orderId: string;
  event: Event;
}

export interface TimelineStartEditEvent {
  order: WorkOrder;
  event: MouseEvent;
}

export interface TimelineDeleteOrderEvent {
  orderId: string;
  event: MouseEvent;
}
