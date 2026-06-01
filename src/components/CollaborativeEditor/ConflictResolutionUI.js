import React from 'react';
import { Alert, Button, Modal } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import './ConflictResolutionUI.css';

const ConflictResolutionUI = ({ conflicts = [], onResolve, onDismiss }) => {
  if (conflicts.length === 0) return null;

  return (
    <div className="conflict-resolution-ui">
      <Alert
        message="Conflict Detected"
        description={`${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''} detected in the document. The system has automatically resolved them using operational transformation.`}
        type="warning"
        icon={<WarningOutlined />}
        showIcon
        closable
        onClose={onDismiss}
        action={
          <Button size="small" onClick={onResolve}>
            View Details
          </Button>
        }
      />
    </div>
  );
};

export default ConflictResolutionUI;
