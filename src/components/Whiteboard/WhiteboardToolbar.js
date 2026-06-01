import React from 'react';
import { Button, Tooltip, Divider, ColorPicker, Slider, Select } from 'antd';
import {
  SelectOutlined,
  EditOutlined,
  LineOutlined,
  BorderOutlined,
  RadiusSettingOutlined,
  FontSizeOutlined,
  DeleteOutlined,
  UndoOutlined,
  RedoOutlined,
  SaveOutlined
} from '@ant-design/icons';
import './WhiteboardToolbar.css';

const WhiteboardToolbar = ({
  currentTool,
  toolSettings,
  onToolChange,
  onToolSettingsChange,
  onUndo,
  onRedo,
  onClear,
  onSave,
  canUndo,
  canRedo,
  permissions
}) => {
  const tools = [
    { key: 'select', icon: <SelectOutlined />, label: 'Select' },
    { key: 'pen', icon: <EditOutlined />, label: 'Pen' },
    { key: 'line', icon: <LineOutlined />, label: 'Line' },
    { key: 'rectangle', icon: <BorderOutlined />, label: 'Rectangle' },
    { key: 'circle', icon: <RadiusSettingOutlined />, label: 'Circle' },
    { key: 'text', icon: <FontSizeOutlined />, label: 'Text' },
    { key: 'eraser', icon: <DeleteOutlined />, label: 'Eraser' }
  ];

  const strokeWidths = [
    { label: 'Thin', value: 1 },
    { label: 'Normal', value: 2 },
    { label: 'Thick', value: 4 },
    { label: 'Extra Thick', value: 8 }
  ];

  return (
    <div className="whiteboard-toolbar">
      <div className="toolbar-section">
        <div className="tool-buttons">
          {tools.map(tool => (
            <Tooltip key={tool.key} title={tool.label}>
              <Button
                type={currentTool === tool.key ? 'primary' : 'default'}
                icon={tool.icon}
                onClick={() => onToolChange(tool.key)}
                disabled={!permissions?.write && tool.key !== 'select'}
              />
            </Tooltip>
          ))}
        </div>
      </div>

      <Divider type="vertical" style={{ height: '40px' }} />

      <div className="toolbar-section">
        <div className="tool-settings">
          <Tooltip title="Stroke Color">
            <ColorPicker
              value={toolSettings?.strokeColor || '#000000'}
              onChange={(color) => onToolSettingsChange({ strokeColor: color.toHexString() })}
              disabled={!permissions?.write}
            />
          </Tooltip>

          <Tooltip title="Fill Color">
            <ColorPicker
              value={toolSettings?.fillColor || 'transparent'}
              onChange={(color) => onToolSettingsChange({ fillColor: color.toHexString() })}
              disabled={!permissions?.write}
            />
          </Tooltip>

          <Select
            value={toolSettings?.strokeWidth || 2}
            onChange={(value) => onToolSettingsChange({ strokeWidth: value })}
            style={{ width: 120 }}
            options={strokeWidths}
            disabled={!permissions?.write}
          />
        </div>
      </div>

      <Divider type="vertical" style={{ height: '40px' }} />

      <div className="toolbar-section">
        <div className="action-buttons">
          <Tooltip title="Undo">
            <Button
              icon={<UndoOutlined />}
              onClick={onUndo}
              disabled={!canUndo || !permissions?.write}
            />
          </Tooltip>

          <Tooltip title="Redo">
            <Button
              icon={<RedoOutlined />}
              onClick={onRedo}
              disabled={!canRedo || !permissions?.write}
            />
          </Tooltip>

          <Tooltip title="Clear All">
            <Button
              icon={<DeleteOutlined />}
              onClick={onClear}
              danger
              disabled={!permissions?.write}
            />
          </Tooltip>

          <Tooltip title="Save">
            <Button
              icon={<SaveOutlined />}
              onClick={onSave}
              type="primary"
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default WhiteboardToolbar;
