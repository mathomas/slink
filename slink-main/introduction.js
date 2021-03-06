'use strict';

const sr = require('./smartrecruiters');
const sapAddEmployee = require('./sap/addemployee');
const introductionsDao = require('./dao/introductionsdao');
const util = require('./util');

/*
 * Obtains applicants by calling the SmartRecruiters facade and calls SAP with each applicant.
 * @returns {Promise<{successfulApplicants: Array}>}
 */
const process = async () => {
  console.info('### Starting INTRODUCTION process');
  const applicants = await sr.getApplicants('OFFERED', 'Offer Accepted');

  const splitByFte = util.split(applicant => applicant.fullTime === true);
  const splitByNeedsIntroduction = util.split(applicant => applicant.employeeId === null);

  const ftes = splitByFte(applicants);
  console.info(`Non-FTE applicants skipped: ${ftes.rejects.length}`);
  const ftesNeedingIntroduction = splitByNeedsIntroduction(ftes.matches);
  console.info(`Already-introduced applicants skipped: ${ftesNeedingIntroduction.rejects.length}`);

  const applicantsIntroducedToSap =
    await Promise.all(ftesNeedingIntroduction.matches
      .map(async (applicant) => {
        const sanitizedApplicant = util.sanitizeApplicant(applicant);

        const resumeNumber = util.generateResumeNumber();
        console.info(`Posting applicant to SAP.  Resume number: ${resumeNumber}, applicant: ${JSON.stringify(sanitizedApplicant)}`);
        const employeeId = await sapAddEmployee.execute(applicant, resumeNumber);

        if (employeeId != null) {
          console.info('Writing item to introduction table for candidate', applicant.id);
          await writeIntroductionRecord(applicant, resumeNumber, employeeId);

          console.info('Posting SAP employee ID to SmartRecruiters for candidate', applicant.id);
          sanitizedApplicant.employeeId = employeeId;
          const srSuccess = await postEmployeeIdToSmartRecruiters(employeeId, applicant);

          const results = {
            applicant: sanitizedApplicant,
            status: (srSuccess ? 'Succeeded' : 'Failed')
          };
          if (!srSuccess) {
            results.reason = 'SR post failure';
          }
          return results;
        }

        return {
          applicant: sanitizedApplicant,
          status: 'Failed',
          reason: 'SAP post failure'
        };
      }));

  const successfulApplicants = applicantsIntroducedToSap.filter(item => item.status === 'Succeeded');
  const unsuccessfulApplicants = applicantsIntroducedToSap.filter(item => item.status === 'Failed');

  const result = {
    attempted: successfulApplicants.length + unsuccessfulApplicants.length,
    successful: successfulApplicants.length,
    unsuccessful: unsuccessfulApplicants.length,
    successfulApplicants,
    unsuccessfulApplicants
  };

  console.info(`Introduction process complete. Results: ${JSON.stringify(result)}`);

  return result;
};

async function postEmployeeIdToSmartRecruiters(employeeId, applicant) {
  console.info(`Preparing to add SAP employee id to Smart Recruiters: ${employeeId}`);
  return sr.storeEmployeeId(
    applicant.id,
    applicant.primaryAssignment.job.id,
    employeeId
  );
}

async function writeIntroductionRecord(applicant, resumeNumber, employeeId) {
  await introductionsDao.write({
    srCandidateId: applicant.id,
    slinkResumeNumber: resumeNumber,
    sapEmployeeId: employeeId
  });
}

module.exports = {
  process
};
