import { Component } from '@angular/core';
import { ScheduleShellComponent } from './schedule/feature-shell/schedule-shell.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ScheduleShellComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'work-order-timeline';
}

