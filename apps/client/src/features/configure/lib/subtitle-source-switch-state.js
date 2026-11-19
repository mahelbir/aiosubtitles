export function setSubtitleSourceSwitch(form, subtitleSource, isOn) {
  form.setFieldValue('subtitleSourceSwitchStates', switchStates => ({
    ...switchStates,
    [subtitleSource]: isOn,
  }));
}
