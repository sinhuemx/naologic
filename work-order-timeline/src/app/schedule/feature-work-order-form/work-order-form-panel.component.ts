import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { WorkCenter, WorkOrderStatus } from '../domain/schedule.models';

@Component({
  selector: 'app-work-order-form-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgSelectModule],
  templateUrl: './work-order-form-panel.component.html'
})
export class WorkOrderFormPanelComponent {
  @Input({ required: true }) panelOpen = false;
  @Input({ required: true }) panelTitle = '';
  @Input({ required: true }) panelPrimaryAction = '';
  @Input({ required: true }) orderForm!: FormGroup;
  @Input({ required: true }) workCenters: WorkCenter[] = [];
  @Input({ required: true }) statusOptions: Array<{ value: WorkOrderStatus; label: string }> = [];
  @Input({ required: true }) formError: string | null = null;
  @Input({ required: true }) submitted = false;

  @Output() closePanel = new EventEmitter<void>();
  @Output() saveOrder = new EventEmitter<void>();

  hasControlError(controlName: string): boolean {
    const control = this.orderForm.get(controlName);
    return !!control && control.invalid && (control.touched || this.submitted);
  }
}
