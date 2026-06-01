const GROUPS_UPDATED_EVENT = "groups-updated";

export const emitGroupsUpdated = () => {
  window.dispatchEvent(
    new CustomEvent(GROUPS_UPDATED_EVENT, {
      detail: { updatedAt: Date.now() },
    })
  );
};

export const subscribeToGroupsUpdated = (callback) => {
  const handler = () => callback();
  window.addEventListener(GROUPS_UPDATED_EVENT, handler);
  return () => window.removeEventListener(GROUPS_UPDATED_EVENT, handler);
};
