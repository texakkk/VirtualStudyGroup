import { configureStore } from '@reduxjs/toolkit';
import userReducer from './features/user/userSlice';
import settingsReducer from './features/settings/settingsSlice';

const store = configureStore({
  reducer: {
    user: userReducer,
    settings: settingsReducer,
    // add other slices here as needed
  },
});

export default store;
