import { Analysis } from '@prisma/client';
import { prisma } from '../lib/prisma';

export async function createRecord(data: {originalFilename: string; cvPath: string; jobDescription: string}): Promise<Analysis> {
    return await prisma.analysis.create({
        data: {
            originalFilename: data.originalFilename,
            cvPath: data.cvPath,
            jobDescription: data.jobDescription,
        },
    });
}

export async function getRecordById(jobId: string): Promise<Analysis | null> {
    return await prisma.analysis.findUnique({
        where: { 
            jobId: jobId 
        },
    });
}