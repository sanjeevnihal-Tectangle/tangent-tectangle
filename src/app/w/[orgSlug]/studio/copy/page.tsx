import type { Metadata } from "next"

import { PageContainer } from "@/components/page/page-header"
import { CopyStudio } from "@/features/copy/copy-studio"

export const metadata: Metadata = { title: "Copy Studio" }

export default function CopyStudioPage() {
  return (
    <PageContainer>
      <CopyStudio />
    </PageContainer>
  )
}
