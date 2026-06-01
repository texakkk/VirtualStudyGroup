const express = require("express");
const router = express.Router();
const { authenticateUser } = require("../middleware/authMiddleware");
const Group = require("../models/Group");
const GroupMember = require("../models/GroupMember");
const Task = require("../models/Task");
const Message = require("../models/Message");
const VideoSession = require("../models/VideoSession");
const User = require("../models/User");
// Using available dependencies
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

// Store for tracking report generation status
const reportStatus = new Map();

// @route POST /api/report/generate
// @desc Generate a comprehensive report
// @access Private
router.post("/generate", authenticateUser, async (req, res) => {
  try {
    const { groupId, config } = req.body;
    const userId = req.user._id;

    // Validate input
    if (!groupId || !config) {
      return res.status(400).json({
        success: false,
        message: "Group ID and configuration are required",
      });
    }

    // Verify user has access to the group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    // Check if user is a member of the group
    const membershipCheck = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: userId,
    });

    if (!membershipCheck) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this group.",
      });
    }

    // Generate unique report ID
    const reportId = `report_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Initialize report status
    reportStatus.set(reportId, {
      status: "processing",
      progress: 0,
      startTime: new Date(),
      groupId,
      userId,
      config,
    });

    // Start report generation asynchronously
    generateReportAsync(reportId, group, config, userId);

    res.json({
      success: true,
      reportId,
      message: "Report generation started",
    });
  } catch (error) {
    console.error("Error starting report generation:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route GET /api/report/status/:reportId
// @desc Get report generation status
// @access Private
router.get("/status/:reportId", authenticateUser, async (req, res) => {
  try {
    const { reportId } = req.params;
    const status = reportStatus.get(reportId);

    if (!status) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    res.json({
      success: true,
      ...status,
    });
  } catch (error) {
    console.error("Error getting report status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route GET /api/report/download/:reportId
// @desc Download generated report
// @access Private
router.get("/download/:reportId", authenticateUser, async (req, res) => {
  try {
    const { reportId } = req.params;
    console.log("Download request for report ID:", reportId);

    const status = reportStatus.get(reportId);
    console.log("Report status:", status);

    if (!status) {
      console.log("Report not found in status map");
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    if (status.status !== "completed") {
      console.log("Report not completed, current status:", status.status);
      return res.status(400).json({
        success: false,
        message: "Report is not ready for download",
      });
    }

    const filePath = status.filePath;
    console.log("File path:", filePath);

    if (!fs.existsSync(filePath)) {
      console.log("File does not exist at path:", filePath);
      return res.status(404).json({
        success: false,
        message: "Report file not found",
      });
    }

    // Set appropriate headers for file download
    const fileName = path.basename(filePath);
    console.log("Sending file:", fileName);

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Type", getContentType(status.config.format));

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error("Error downloading report:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route DELETE /api/report/cancel/:reportId
// @desc Cancel report generation
// @access Private
router.delete("/cancel/:reportId", authenticateUser, async (req, res) => {
  try {
    const { reportId } = req.params;
    const status = reportStatus.get(reportId);

    if (!status) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    // Update status to cancelled
    reportStatus.set(reportId, {
      ...status,
      status: "cancelled",
      endTime: new Date(),
    });

    res.json({
      success: true,
      message: "Report generation cancelled",
    });
  } catch (error) {
    console.error("Error cancelling report:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route GET /api/report/test
// @desc Test report functionality
// @access Private
router.get("/test", authenticateUser, async (req, res) => {
  try {
    const tempDir = path.join(__dirname, "../temp");
    const testFile = path.join(tempDir, "test.txt");

    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create test file
    fs.writeFileSync(testFile, "This is a test file");

    // Check if file exists
    const fileExists = fs.existsSync(testFile);

    // Clean up
    if (fileExists) {
      fs.unlinkSync(testFile);
    }

    res.json({
      success: true,
      message: "Test completed successfully",
      tempDir,
      fileExists,
      reportStatusSize: reportStatus.size,
    });
  } catch (error) {
    console.error("Test error:", error);
    res.status(500).json({
      success: false,
      message: "Test failed",
      error: error.message,
    });
  }
});

// Async function to generate report
async function generateReportAsync(reportId, group, config, userId) {
  try {
    console.log("Starting report generation for:", reportId);

    // Update progress
    updateReportProgress(reportId, 10, "Fetching group data...");

    // Fetch all required data
    const groupData = await fetchGroupData(group._id, config);
    updateReportProgress(reportId, 30, "Processing data...");

    // Generate report based on format
    let filePath;
    console.log("Generating report in format:", config.format);

    switch (config.format.toLowerCase()) {
      case "pdf":
        filePath = await generatePDFReport(reportId, group, groupData, config);
        break;
      case "excel":
        filePath = await generateExcelReport(
          reportId,
          group,
          groupData,
          config
        );
        break;
      case "word":
        filePath = await generateWordReport(reportId, group, groupData, config);
        break;
      default:
        throw new Error("Unsupported format");
    }

    console.log("Report generated at path:", filePath);
    updateReportProgress(reportId, 100, "Report generated successfully");

    // Update final status
    const fileStats = fs.statSync(filePath);
    console.log("File size:", fileStats.size);

    reportStatus.set(reportId, {
      ...reportStatus.get(reportId),
      status: "completed",
      filePath,
      endTime: new Date(),
      fileSize: fileStats.size,
    });

    console.log("Report status updated to completed");
  } catch (error) {
    console.error("Error generating report:", error);
    reportStatus.set(reportId, {
      ...reportStatus.get(reportId),
      status: "failed",
      error: error.message,
      endTime: new Date(),
    });
  }
}

// Helper function to update report progress
function updateReportProgress(reportId, progress, message) {
  const status = reportStatus.get(reportId);
  if (status) {
    reportStatus.set(reportId, {
      ...status,
      progress,
      message,
    });
  }
}

// Helper function to fetch group data
async function fetchGroupData(groupId, config) {
  const data = {};

  // Parse date range
  const startDate = new Date(config.dateRange.startDate);
  const endDate = new Date(config.dateRange.endDate);

  // Fetch data based on enabled sources
  for (const source of config.dataSources) {
    if (!source.enabled) continue;

    switch (source.type) {
      case "group-management":
        data.group = await Group.findById(groupId);
        data.groupMembers = await GroupMember.find({
          GroupMember_groupId: groupId,
        }).populate("GroupMember_userId", "User_name User_email");
        break;

      case "task-manager":
        data.tasks = await Task.find({
          Task_groupId: groupId,
          Task_createdAt: { $gte: startDate, $lte: endDate },
        }).populate("Task_assignedTo Task_createdBy");
        break;

      case "chat":
        data.messages = await Message.find({
          Message_groupId: groupId,
          Message_timestamp: { $gte: startDate, $lte: endDate },
        }).populate("Message_sender");
        break;

      case "video-chat":
        data.videoSessions = await VideoSession.find({
          VideoSession_groupId: groupId,
          VideoSession_startTime: { $gte: startDate, $lte: endDate },
        }).populate("VideoSession_participants.user");
        break;

      case "members":
        if (!data.groupMembers) {
          data.groupMembers = await GroupMember.find({
            GroupMember_groupId: groupId,
          }).populate("GroupMember_userId", "User_name User_email");
        }
        data.members = data.groupMembers
          .map((member) => member.GroupMember_userId)
          .filter(Boolean);
        break;
    }
  }

  return data;
}

// Helper function to generate PDF report (simplified HTML to PDF)
async function generatePDFReport(reportId, group, data, config) {
  const fileName = `${group.Group_name}_Report_${Date.now()}.html`;
  const filePath = path.join(__dirname, "../temp", fileName);

  console.log("Generating PDF report:", fileName);
  console.log("File path:", filePath);

  // Ensure temp directory exists
  const tempDir = path.dirname(filePath);
  console.log("Temp directory:", tempDir);

  if (!fs.existsSync(tempDir)) {
    console.log("Creating temp directory");
    fs.mkdirSync(tempDir, { recursive: true });
  } else {
    console.log("Temp directory already exists");
  }

  // Generate HTML content
  let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${
        config.customization.title || `${group.Group_name} Report`
      }</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1 { color: #333; border-bottom: 2px solid #667eea; }
        h2 { color: #555; margin-top: 30px; }
        .summary { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .metric { display: inline-block; margin: 10px 20px 10px 0; }
        .metric-value { font-size: 24px; font-weight: bold; color: #667eea; }
        .metric-label { font-size: 12px; color: #666; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .footer { margin-top: 50px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <h1>${config.customization.title || `${group.Group_name} Report`}</h1>
  `;

  if (config.customization.description) {
    htmlContent += `<p>${config.customization.description}</p>`;
  }

  htmlContent += `
    <h2>Group Information</h2>
    <div class="summary">
      <p><strong>Name:</strong> ${group.Group_name}</p>
      <p><strong>Description:</strong> ${
        group.Group_description || "No description"
      }</p>
      <p><strong>Created:</strong> ${new Date(
        group.Group_createdAt
      ).toLocaleDateString()}</p>
    </div>
  `;

  // Add metrics summary
  if (data.tasks || data.messages || data.videoSessions) {
    htmlContent += '<h2>Summary Metrics</h2><div class="summary">';

    if (data.tasks) {
      const completedTasks = data.tasks.filter(
        (t) => t.Task_status === "completed"
      ).length;
      htmlContent += `
        <div class="metric">
          <div class="metric-value">${data.tasks.length}</div>
          <div class="metric-label">Total Tasks</div>
        </div>
        <div class="metric">
          <div class="metric-value">${completedTasks}</div>
          <div class="metric-label">Completed</div>
        </div>
        <div class="metric">
          <div class="metric-value">${
            data.tasks.length > 0
              ? ((completedTasks / data.tasks.length) * 100).toFixed(1)
              : 0
          }%</div>
          <div class="metric-label">Completion Rate</div>
        </div>
      `;
    }

    if (data.messages) {
      const uniqueSenders = [
        ...new Set(data.messages.map((m) => m.Message_sender?._id)),
      ].length;
      htmlContent += `
        <div class="metric">
          <div class="metric-value">${data.messages.length}</div>
          <div class="metric-label">Messages</div>
        </div>
        <div class="metric">
          <div class="metric-value">${uniqueSenders}</div>
          <div class="metric-label">Active Members</div>
        </div>
      `;
    }

    if (data.videoSessions) {
      const totalDuration = data.videoSessions.reduce((acc, session) => {
        if (session.VideoSession_endTime && session.VideoSession_startTime) {
          return (
            acc +
            (new Date(session.VideoSession_endTime) -
              new Date(session.VideoSession_startTime))
          );
        }
        return acc;
      }, 0);
      htmlContent += `
        <div class="metric">
          <div class="metric-value">${data.videoSessions.length}</div>
          <div class="metric-label">Video Sessions</div>
        </div>
        <div class="metric">
          <div class="metric-value">${Math.round(
            totalDuration / (1000 * 60)
          )}</div>
          <div class="metric-label">Total Minutes</div>
        </div>
      `;
    }

    htmlContent += "</div>";
  }

  // Add detailed tables
  if (data.tasks && data.tasks.length > 0) {
    htmlContent += `
      <h2>Task Details</h2>
      <table>
        <tr>
          <th>Task Name</th>
          <th>Status</th>
          <th>Priority</th>
          <th>Progress</th>
          <th>Created</th>
        </tr>
    `;
    data.tasks.forEach((task) => {
      htmlContent += `
        <tr>
          <td>${task.Task_name}</td>
          <td>${task.Task_status || "pending"}</td>
          <td>${task.Task_priority || "medium"}</td>
          <td>${task.Task_progress || 0}%</td>
          <td>${new Date(task.Task_createdAt).toLocaleDateString()}</td>
        </tr>
      `;
    });
    htmlContent += "</table>";
  }

  // Add footer
  if (config.customization.includeHeaders) {
    htmlContent += `
      <div class="footer">
        <p>Generated on ${new Date().toLocaleString()}
        ${
          config.customization.includeBranding ? " | Generated by StudyHub" : ""
        }
        </p>
      </div>
    `;
  }

  htmlContent += "</body></html>";

  fs.writeFileSync(filePath, htmlContent);
  console.log("HTML file written successfully");
  console.log("File exists after write:", fs.existsSync(filePath));
  return filePath;
}

// Helper function to generate Excel report
async function generateExcelReport(reportId, group, data, config) {
  const fileName = `${group.Group_name}_Report_${Date.now()}.xlsx`;
  const filePath = path.join(__dirname, "../temp", fileName);

  // Ensure temp directory exists
  const tempDir = path.dirname(filePath);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const workbook = XLSX.utils.book_new();

  // Summary worksheet
  const summaryData = [
    ["Group Report Summary"],
    ["Group Name", group.Group_name],
    ["Description", group.Group_description || "No description"],
    ["Created", new Date(group.Group_createdAt).toLocaleDateString()],
    ["Generated", new Date().toLocaleDateString()],
    [],
  ];

  if (data.tasks) {
    const completedTasks = data.tasks.filter(
      (t) => t.Task_status === "completed"
    ).length;
    summaryData.push(
      ["Task Summary"],
      ["Total Tasks", data.tasks.length],
      ["Completed Tasks", completedTasks],
      [
        "Completion Rate",
        `${
          data.tasks.length > 0
            ? ((completedTasks / data.tasks.length) * 100).toFixed(1)
            : 0
        }%`,
      ],
      []
    );
  }

  if (data.messages) {
    const uniqueSenders = [
      ...new Set(data.messages.map((m) => m.Message_sender?._id)),
    ].length;
    summaryData.push(
      ["Communication Summary"],
      ["Total Messages", data.messages.length],
      ["Active Members", uniqueSenders],
      []
    );
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  // Tasks worksheet
  if (data.tasks && data.tasks.length > 0) {
    const tasksData = [
      [
        "Task Name",
        "Status",
        "Priority",
        "Progress",
        "Created Date",
        "Due Date",
      ],
    ];

    data.tasks.forEach((task) => {
      tasksData.push([
        task.Task_name,
        task.Task_status || "pending",
        task.Task_priority || "medium",
        `${task.Task_progress || 0}%`,
        new Date(task.Task_createdAt).toLocaleDateString(),
        task.Task_dueDate
          ? new Date(task.Task_dueDate).toLocaleDateString()
          : "No due date",
      ]);
    });

    const tasksSheet = XLSX.utils.aoa_to_sheet(tasksData);
    XLSX.utils.book_append_sheet(workbook, tasksSheet, "Tasks");
  }

  // Messages worksheet
  if (data.messages && data.messages.length > 0) {
    const messagesData = [["Sender", "Message", "Timestamp"]];

    data.messages.forEach((message) => {
      messagesData.push([
        message.Message_sender?.User_name || "Unknown",
        message.Message_content || "",
        new Date(message.Message_timestamp).toLocaleString(),
      ]);
    });

    const messagesSheet = XLSX.utils.aoa_to_sheet(messagesData);
    XLSX.utils.book_append_sheet(workbook, messagesSheet, "Messages");
  }

  // Video sessions worksheet
  if (data.videoSessions && data.videoSessions.length > 0) {
    const videoData = [
      [
        "Session ID",
        "Start Time",
        "End Time",
        "Duration (minutes)",
        "Participants",
      ],
    ];

    data.videoSessions.forEach((session) => {
      const duration =
        session.VideoSession_endTime && session.VideoSession_startTime
          ? Math.round(
              (new Date(session.VideoSession_endTime) -
                new Date(session.VideoSession_startTime)) /
                (1000 * 60)
            )
          : "Ongoing";

      videoData.push([
        session._id.toString(),
        new Date(session.VideoSession_startTime).toLocaleString(),
        session.VideoSession_endTime
          ? new Date(session.VideoSession_endTime).toLocaleString()
          : "Ongoing",
        duration,
        session.VideoSession_participants?.length || 0,
      ]);
    });

    const videoSheet = XLSX.utils.aoa_to_sheet(videoData);
    XLSX.utils.book_append_sheet(workbook, videoSheet, "Video Sessions");
  }

  XLSX.writeFile(workbook, filePath);
  return filePath;
}

// Helper function to generate Word report (simplified)
async function generateWordReport(reportId, group, data, config) {
  // For now, generate a simple text file as Word generation requires additional libraries
  const fileName = `${group.Group_name}_Report_${Date.now()}.txt`;
  const filePath = path.join(__dirname, "../temp", fileName);

  // Ensure temp directory exists
  const tempDir = path.dirname(filePath);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  let content = `${
    config.customization.title || `${group.Group_name} Report`
  }\n`;
  content += `${"=".repeat(50)}\n\n`;

  if (config.customization.description) {
    content += `${config.customization.description}\n\n`;
  }

  content += `Group Information:\n`;
  content += `Name: ${group.Group_name}\n`;
  content += `Description: ${group.Group_description || "No description"}\n`;
  content += `Created: ${new Date(
    group.Group_createdAt
  ).toLocaleDateString()}\n\n`;

  if (data.tasks) {
    content += `Task Summary:\n`;
    content += `Total Tasks: ${data.tasks.length}\n`;
    const completedTasks = data.tasks.filter(
      (t) => t.Task_status === "completed"
    ).length;
    content += `Completed Tasks: ${completedTasks}\n`;
    content += `Completion Rate: ${
      data.tasks.length > 0
        ? ((completedTasks / data.tasks.length) * 100).toFixed(1)
        : 0
    }%\n\n`;
  }

  if (data.messages) {
    content += `Communication Summary:\n`;
    content += `Total Messages: ${data.messages.length}\n`;
    const uniqueSenders = [
      ...new Set(data.messages.map((m) => m.Message_sender?._id)),
    ].length;
    content += `Active Members: ${uniqueSenders}\n\n`;
  }

  content += `\nGenerated on ${new Date().toLocaleString()}\n`;
  if (config.customization.includeBranding) {
    content += `Generated by StudyHub\n`;
  }

  fs.writeFileSync(filePath, content);
  return filePath;
}

// Helper function to get content type
function getContentType(format) {
  switch (format.toLowerCase()) {
    case "pdf":
      return "text/html"; // HTML file for now
    case "excel":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "word":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

module.exports = router;
