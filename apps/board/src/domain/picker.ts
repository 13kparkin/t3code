/** What the picker holds: an instance, the model typed or chosen for it, and its effort, empty for the model's own default. */
export interface PickerValue {
  readonly instanceId: string;
  readonly model: string;
  readonly effort: string;
}
