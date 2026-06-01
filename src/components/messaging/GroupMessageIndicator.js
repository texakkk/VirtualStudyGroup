import React from 'react';
import { FaUsers } from 'react-icons/fa';
import './GroupMessageIndicator.css';

const GroupMessageIndicator = ({ groupName, isMultiGroup = false, onClick }) => {
  if (!isMultiGroup) return null;

  return (
    <div className="group-message-indicator" onClick={onClick}>
      <FaUsers className="group-indicator-icon" />
      <span className="group-indicator-text">
        Sent to {groupName}
      </span>
    </div>
  );
};

export default GroupMessageIndicator;