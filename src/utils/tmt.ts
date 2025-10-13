import tencentcloud from 'tencentcloud-sdk-nodejs-tmt'

export async function translateText(secretId, secretKey, text: string) {
  const clientConfig = {
    credential: {
      secretId,
      secretKey,
    },
    region: 'ap-guangzhou',
    profile: {
      httpProfile: {
        endpoint: 'tmt.tencentcloudapi.com',
      },
    },
  }
  const TmtClient = tencentcloud.tmt.v20180321.Client
  const client = new TmtClient(clientConfig)
  const params = {
    SourceText: text,
    Source: 'zh',
    Target: 'en',
    ProjectId: 0,
  }
  const translateText = await client.TextTranslate(params)
  return translateText.TargetText
}
