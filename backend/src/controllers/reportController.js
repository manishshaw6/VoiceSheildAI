import {
  generateIncidentReport,
  getIncidentReportById,
  approveIncidentReport,
  cancelIncidentReport,
  sendIncidentReport,
  verifyReportPublic
} from '../services/incidentReportService.js';
import { generateIncidentPdfBuffer } from '../services/reportPdfService.js';

export async function generateReport(req, res, next) {
  try {
    const { analysisId } = req.body;
    const report = await generateIncidentReport({ analysisId, user: req.user });
    return res.status(201).json({
      success: true,
      report
    });
  } catch (err) {
    return next(err);
  }
}

export async function getReport(req, res, next) {
  try {
    const reportData = await getIncidentReportById(req.params.id, req.user);
    return res.status(200).json({
      success: true,
      ...reportData
    });
  } catch (err) {
    return next(err);
  }
}

export async function getReportPdf(req, res, next) {
  try {
    const reportData = await getIncidentReportById(req.params.id, req.user);
    const pdfBuffer = await generateIncidentPdfBuffer(reportData.report);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="VoxShield_Report_${reportData.id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err) {
    return next(err);
  }
}

export async function verifyReport(req, res, next) {
  try {
    const verification = await verifyReportPublic(req.params.id);
    return res.status(200).json(verification);
  } catch (err) {
    return next(err);
  }
}

export async function approveReport(req, res, next) {
  try {
    const consentGiven = req.body.consentGiven !== false;
    const result = await approveIncidentReport({
      reportId: req.params.id,
      user: req.user,
      consentGiven
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function cancelReport(req, res, next) {
  try {
    const result = await cancelIncidentReport({
      reportId: req.params.id,
      user: req.user
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function sendReport(req, res, next) {
  try {
    const { organizationContactId } = req.body;
    const result = await sendIncidentReport({
      reportId: req.params.id,
      user: req.user,
      organizationContactId
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getReportStatus(req, res, next) {
  try {
    const reportData = await getIncidentReportById(req.params.id, req.user);
    return res.status(200).json({
      success: true,
      reportId: reportData.id,
      status: reportData.status,
      approvedAt: reportData.approvedAt,
      sentAt: reportData.sentAt,
      delivery: reportData.deliveryMetadata
    });
  } catch (err) {
    return next(err);
  }
}
