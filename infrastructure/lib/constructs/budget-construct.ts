import * as budgets from 'aws-cdk-lib/aws-budgets'
import { Construct } from 'constructs'

export interface BudgetConstructProps {
  /** D-18: staging alarm notification recipient. */
  readonly alertEmail: string
  /** D-19: USD 25/month budget alarm. */
  readonly monthlyLimitUsd?: number
}

/**
 * AWS Budgets monthly cost alarm for the staging account, notifying the
 * approved recipient at 80% actual spend and 100% forecasted spend
 * (D-18, D-19).
 */
export class BudgetConstruct extends Construct {
  public constructor(
    scope: Construct,
    id: string,
    props: BudgetConstructProps,
  ) {
    super(scope, id)

    const monthlyLimitUsd = props.monthlyLimitUsd ?? 25

    new budgets.CfnBudget(this, 'MonthlyCostBudget', {
      budget: {
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: monthlyLimitUsd,
          unit: 'USD',
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            { subscriptionType: 'EMAIL', address: props.alertEmail },
          ],
        },
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            { subscriptionType: 'EMAIL', address: props.alertEmail },
          ],
        },
      ],
    })
  }
}
