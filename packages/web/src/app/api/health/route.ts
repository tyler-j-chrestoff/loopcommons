import { NextResponse } from 'next/server';
import * as fs from 'node:fs';
import * as path from 'node:path';

export async function GET() {
  const cwd = process.cwd();
  const blogDataDir = process.env.BLOG_DATA_DIR ?? 'data/blog';
  const resolvedBlog = path.resolve(cwd, blogDataDir);
  const publishedDir = path.join(resolvedBlog, 'published');

  let blogFiles: string[] = [];
  let blogDirExists = false;
  let publishedDirExists = false;
  try {
    blogDirExists = fs.existsSync(resolvedBlog);
    publishedDirExists = fs.existsSync(publishedDir);
    if (publishedDirExists) {
      blogFiles = fs.readdirSync(publishedDir);
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    status: 'ok',
    commit: process.env.NEXT_PUBLIC_BUILD_COMMIT || 'unknown',
    timestamp: new Date().toISOString(),
    debug: {
      cwd,
      blogDataDir,
      resolvedBlog,
      blogDirExists,
      publishedDirExists,
      blogFiles,
    },
  });
}
