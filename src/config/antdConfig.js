import { message } from 'antd';
import { ConfigProvider } from 'antd';

/**
 * Configure Ant Design components globally
 */

// Configure message component
message.config({
  top: 80,
  duration: 5,
  maxCount: 3,
  rtl: false,
  prefixCls: 'ant-message',
});

// Configure Modal and other components via ConfigProvider.config (replaces deprecated Modal.config)
ConfigProvider.config({
  modal: {
    centered: true,
    maskClosable: true,
    keyboard: true,
  },
});

export { message };
