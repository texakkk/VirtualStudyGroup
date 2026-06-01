// Import verification script to check all components can be imported correctly

// Core components
import RichTextEditor from './RichTextEditor';
import RichTextEditorDemo from './RichTextEditorDemo';
import NotesDashboard from './NotesDashboard';
import NoteDialog from './NoteDialog';
import NotesManager from './NotesManager';
import DocumentConverter from './DocumentConverter';
import VersionHistory from './VersionHistory';
import EnhancedNoteDialog from './EnhancedNoteDialog';
import DocumentConverterDemo from './DocumentConverterDemo';

// Services and utilities
import { notesApi } from '../../services/notesApi';
import apiErrorHandler from '../../utils/apiErrorHandler';
import AuthContext from '../../contexts/AuthContext';

// Verify all imports are working
const verifyImports = () => {
  const components = {
    RichTextEditor,
    RichTextEditorDemo,
    NotesDashboard,
    NoteDialog,
    NotesManager,
    DocumentConverter,
    VersionHistory,
    EnhancedNoteDialog,
    DocumentConverterDemo,
  };

  const services = {
    notesApi,
    apiErrorHandler,
    AuthContext,
  };

  console.log('✅ All components imported successfully:', Object.keys(components));
  console.log('✅ All services imported successfully:', Object.keys(services));

  return {
    components,
    services,
    success: true,
  };
};

export default verifyImports;
export {
  RichTextEditor,
  RichTextEditorDemo,
  NotesDashboard,
  NoteDialog,
  NotesManager,
  DocumentConverter,
  VersionHistory,
  EnhancedNoteDialog,
  DocumentConverterDemo,
};