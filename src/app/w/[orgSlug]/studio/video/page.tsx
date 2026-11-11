import type { Metadata } from "next"

import { PageContainer } from "@/components/page/page-header"
import { VideoStudio } from "@/features/video/video-studio"

export const metadata: Metadata = { title: "Video Studio" }

export default function VideoStudioPage() {
  return (
    <PageContainer>
      <VideoStudio />
    </PageContainer>
  )
}

