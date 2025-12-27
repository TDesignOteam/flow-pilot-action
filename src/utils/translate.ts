import * as tencentcloud from 'tencentcloud-sdk-nodejs-hunyuan'

export async function translateText(secretId: string, secretKey: string, text: string) {
  const clientConfig = {
    credential: {
      secretId,
      secretKey,
    },
    region: 'ap-guangzhou',
    profile: {
      httpProfile: {
        endpoint: 'hunyuan.tencentcloudapi.com',
      },
    },
  }
  const HunyuanClient = tencentcloud.hunyuan.v20230901.Client
  const client = new HunyuanClient(clientConfig)

  const params = {
    Model: 'hunyuan-translation',
    Stream: false,
    Text: text,
    Source: 'zh',
    Target: 'en',
  }
  try {
    const translateText = await client.ChatTranslations(params)
    return translateText.Choices?.map(choice => choice?.Message?.Content).join('\n') || ''
  }
  catch {
    return 'translation failed'
  }
}
