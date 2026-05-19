async function runDriverVerificationProcess(
    reportId: string,
    userId: string,
    docImage: any,
    clientId: string,
    secretKey: string,
    baseUrl: string,
    idfyAccountId: string,
    idfyApiKey: string,
    requestData: any
): Promise<void> {
    const path = `fg_reports/${reportId}/results`;
    const now = () => new Date().toISOString();
    
    // Initialize verification result flags
    const results = {
        ocrExtraction: false,
        dlVerification: false,
        crimeVerification: false,
    };

    let extractedDetails: any = null;
    let dlVerificationData: any = null;

    try {
        // STEP 1: OCR Extraction from DL Image using IDFY
        try {
            console.log(`Starting OCR extraction for report ${reportId}`);
            
            let imageBase64: string;
            
            if (docImage instanceof File) {
                const arrayBuffer = await docImage.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                imageBase64 = buffer.toString('base64');
            } else if (Buffer.isBuffer(docImage)) {
                imageBase64 = docImage.toString('base64');
            } else {
                throw new Error("Invalid image format");
            }
            
            const taskId = uuidv4();
            const groupId = uuidv4();
            
            const idfyPayload = {
                task_id: taskId,
                group_id: groupId,
                data: {
                    document1: imageBase64,
                }
            };
            
            console.log(`Calling IDFY API with task_id: ${taskId}`);
            
            const idfyResponse = await axios.post(
                'https://eve.idfy.com/v3/tasks/async/extract/ind_driving_license',
                idfyPayload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'account-id': idfyAccountId,
                        'api-key': idfyApiKey
                    }
                }
            );
            
            const requestId = idfyResponse.data?.request_id;
            console.log(`IDFY API response - Request ID: ${requestId}`);
            
            if (!requestId) {
                throw new Error("No request_id received from IDFY");
            }
            
            let extractionResult = null;
            let attempts = 0;
            const maxAttempts = 30;
            
            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                try {
                    const statusResponse = await axios.get(
                        `https://eve.idfy.com/v3/tasks`,
                        {
                            params: { request_id: requestId },
                            headers: {
                                'account-id': idfyAccountId,
                                'api-key': idfyApiKey,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    
                    const tasks = statusResponse.data;
                    
                    if (Array.isArray(tasks) && tasks.length > 0) {
                        const task = tasks[0];
                        console.log(`Poll attempt ${attempts + 1}: Task status = ${task.status}`);
                        
                        if (task.status === 'completed') {
                            extractionResult = task;
                            console.log(`Extraction completed for request ${requestId}`);
                            break;
                        } else if (task.status === 'failed') {
                            throw new Error(`IDFY extraction failed: ${task.error || 'Unknown error'}`);
                        }
                    }
                } catch (pollError: any) {
                    console.error(`Poll attempt ${attempts + 1} failed:`, pollError.message);
                }
                
                attempts++;
            }
            
            if (!extractionResult) {
                throw new Error(`IDFY extraction timeout after ${maxAttempts} seconds`);
            }
            
            let extractionOutput = null;
            if (extractionResult?.result?.extraction_output) {
                extractionOutput = extractionResult.result.extraction_output;
            }
            
            if (extractionOutput) {
                const output = extractionOutput;
                extractedDetails = {
                    name: output.name_on_card,
                    fatherName: output.fathers_name,
                    licenseNumber: output.id_number,
                    dateOfBirth: output.date_of_birth,
                    address: output.address,
                    dateOfIssue: output.issue_dates?.LMV || output.issue_dates?.MCWG || "",
                    dateOfExpiry: output.validity?.NT || "",
                    issuingAuthority: output.state || "",
                    bloodGroup: "",
                    cov: output.type || [],
                    district: output.district,
                    pincode: output.pincode,
                    streetAddress: output.street_address
                };
                results.ocrExtraction = true;

                await addRecord(path, {
                    userId,
                    type: "OCR",
                    status: 1,
                    details: JSON.stringify(extractedDetails),
                    idfyResponse: extractionResult,
                    createdAt: now(),
                });

                console.log(`OCR extraction successful for report ${reportId}`);
                console.log(`Extracted: Name=${extractedDetails.name}, License=${extractedDetails.licenseNumber}, DOB=${extractedDetails.dateOfBirth}`);
            } else {
                throw new Error("OCR extraction failed: No extraction output in response");
            }

        } catch (ocrError: any) {
            console.error("OCR extraction failed:", ocrError);
            results.ocrExtraction = false;
            
            await addRecord(path, {
                userId,
                type: "OCR",
                status: 2,
                details: JSON.stringify({
                    error: ocrError?.message || "OCR extraction failed",
                    timestamp: now()
                }),
                createdAt: now(),
            });
            
            // Update verification request as failed with extracted details if available
            await updateRecord("fg_verificationRequests", reportId, {
                status: 2,
                error: `OCR failed: ${ocrError?.message}`,
                extractedDetails: extractedDetails ? {
                    name: extractedDetails.name,
                    fatherName: extractedDetails.fatherName,
                    licenseNumber: extractedDetails.licenseNumber,
                    dateOfBirth: extractedDetails.dateOfBirth,
                    address: extractedDetails.address
                } : null,
                failedAt: now(),
            });
            return;
        }

        // STEP 2: DL Verification using IDFY
        try {
            if (!extractedDetails?.licenseNumber) {
                throw new Error("License number not found in OCR data");
            }

            if (!extractedDetails?.dateOfBirth) {
                throw new Error("Date of birth not found in OCR data");
            }

            console.log(`Calling IDFY DL verification API with License: ${extractedDetails.licenseNumber}, DOB: ${extractedDetails.dateOfBirth}`);

            const dlVerificationResult = await getDrivingLicenseFromIDfy(
                extractedDetails.licenseNumber,
                extractedDetails.dateOfBirth
            );
            
            if (dlVerificationResult?.code === 200) {
                dlVerificationData = dlVerificationResult.result;
                results.dlVerification = true;

                await addRecord(path, {
                    userId,
                    type: "DL_VERIFICATION",
                    status: 1,
                    details: JSON.stringify(dlVerificationData),
                    createdAt: now(),
                });

                console.log(`DL verification successful for report ${reportId}`);
            } else {
                throw new Error(`DL verification failed: ${dlVerificationResult?.message || "Invalid response from IDFY"}`);
            }

        } catch (dlError: any) {
            console.error("DL verification failed:", dlError);
            results.dlVerification = false;
            
            await addRecord(path, {
                userId,
                type: "DL_VERIFICATION",
                status: 2,
                details: JSON.stringify({
                    error: dlError?.message || "DL verification failed",
                    timestamp: now()
                }),
                createdAt: now(),
            });
            
            // Update verification request as failed with extracted details
            await updateRecord("fg_verificationRequests", reportId, {
                status: 2,
                error: `DL verification failed: ${dlError?.message}`,
                extractedDetails: {
                    name: extractedDetails?.name,
                    fatherName: extractedDetails?.fatherName,
                    licenseNumber: extractedDetails?.licenseNumber,
                    dateOfBirth: extractedDetails?.dateOfBirth,
                    address: extractedDetails?.address
                },
                failedAt: now(),
            });
            return;
        }

        // STEP 3: Crime Verification
        try {
            const crimePayload = {
                name: extractedDetails?.name,
                fatherName: extractedDetails?.fatherName || extractFatherName(extractedDetails?.name),
                dob: formatDobForCrimeCheck(extractedDetails?.dateOfBirth),
                address: extractedDetails?.address || extractedDetails?.streetAddress,
            };

            console.log(`Initiating crime check for report ${reportId} with payload:`, crimePayload);

            await createCrimeCheck(crimePayload, reportId, userId);
            results.crimeVerification = true;

            // Update main verification request with success status and extracted details
            const updateResult = await updateRecord("fg_verificationRequests", reportId, {
                status: 1,
                reportUrl: `https://www.fraudcheck.ai/driver-verification-v2-report/${reportId}`,
                reportSummary: { ...results },
                extractedDetails: {
                    name: extractedDetails?.name,
                    fatherName: extractedDetails?.fatherName,
                    licenseNumber: extractedDetails?.licenseNumber,
                    dateOfBirth: extractedDetails?.dateOfBirth,
                    address: extractedDetails?.address
                },
                error: null,
                expectedCompletionDate: moment().add(2, "days").format("DD-MM-YYYY"),
                completedAt: now(),
            });

            if (!updateResult.success) {
                throw new Error(`${updateResult?.error ?? "Failed to update verification request status"}`);
            }

            console.log(`:white_check_mark: Crime check initiated successfully for report ${reportId}`);

        } catch (crimeError: any) {
            console.error("Crime verification failed:", crimeError);
            results.crimeVerification = false;
            
            // Update main verification request with partial failure and extracted details
            await updateRecord("fg_verificationRequests", reportId, {
                status: 1,
                reportUrl: `${process.env.BASE_URL}/driver-verification-report/${reportId}`,
                reportSummary: { ...results },
                extractedDetails: {
                    name: extractedDetails?.name,
                    fatherName: extractedDetails?.fatherName,
                    licenseNumber: extractedDetails?.licenseNumber,
                    dateOfBirth: extractedDetails?.dateOfBirth,
                    address: extractedDetails?.address
                },
                error: `Verification failed: ${crimeError?.message}`,
                expectedCompletionDate: moment().add(2, "days").format("DD-MM-YYYY"),
                completedAt: now(),
            });
        }

    } catch (fatalErr: any) {
        console.error("Fatal error in runDriverVerificationProcess:", fatalErr);

        try {
            await updateRecord("fg_verificationRequests", requestData.verificationRequestId, {
                status: 2,
                error: fatalErr?.message || "Unknown fatal error during processing",
                extractedDetails: extractedDetails ? {
                    name: extractedDetails.name,
                    fatherName: extractedDetails.fatherName,
                    licenseNumber: extractedDetails.licenseNumber,
                    dateOfBirth: extractedDetails.dateOfBirth,
                    address: extractedDetails.address
                } : null,
                failedAt: now(),
            });

            await addRecord(path, {
                userId,
                type: "SYSTEM",
                status: 2,
                details: JSON.stringify({
                    error: "Fatal processing error",
                    message: fatalErr?.message,
                    timestamp: now()
                }),
                createdAt: now(),
            });
        } catch (updateError: any) {
            console.error("Failed to update error status:", updateError);
        }
    }
}