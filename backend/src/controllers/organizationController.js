import { searchOrganizations, getOrganizationById } from '../services/organizationDirectoryService.js';
import { notFoundError } from '../schemas/errors.js';

export async function getOrganizations(req, res, next) {
  try {
    const q = req.query.q || req.query.search || '';
    const orgs = await searchOrganizations(q);
    return res.status(200).json({
      success: true,
      count: orgs.length,
      organizations: orgs
    });
  } catch (err) {
    return next(err);
  }
}

export async function getOrganization(req, res, next) {
  try {
    const org = await getOrganizationById(req.params.id);
    if (!org) throw notFoundError('Organization');
    return res.status(200).json({
      success: true,
      organization: org
    });
  } catch (err) {
    return next(err);
  }
}
