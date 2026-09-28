/** Forms auto-dismiss (canceled) in simulation, unless a scripted answer is queued. */
export const FormCancelationReason = { UserBusy: "UserBusy", UserClosed: "UserClosed" };
export const answers: (number | null)[] = [];
class Base {
  title() { return this; }
  body() { return this; }
  button() { return this; }
  button1() { return this; }
  button2() { return this; }
  dropdown() { return this; }
  toggle() { return this; }
  async show() {
    const a = answers.shift();
    if (a === undefined || a === null) return { canceled: true, cancelationReason: "UserClosed" };
    return { canceled: false, selection: a };
  }
}
export class ActionFormData extends Base {}
export class MessageFormData extends Base {}
export class ModalFormData extends Base {}
