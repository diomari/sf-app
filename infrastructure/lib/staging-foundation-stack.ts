import { Stack, type StackProps } from 'aws-cdk-lib'
import type { Construct } from 'constructs'

/**
 * Milestone 1 foundation only. Application resources are introduced in
 * Milestone 6 after their security controls can be implemented together.
 */
export class StagingFoundationStack extends Stack {
  public constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props)
  }
}
